import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

// Mirrors the formats the transcription API accepts.
export const SUPPORTED_AUDIO_EXTENSIONS = ["mp3", "mp4", "mpeg", "mpga", "m4a", "wav", "webm", "ogg", "flac"];
export const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
export const DOWNLOAD_TIMEOUT_MS = 30_000;

const CONTENT_TYPE_EXTENSIONS: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
  "audio/mp4": "m4a",
  "audio/m4a": "m4a",
  "audio/x-m4a": "m4a",
  "audio/ogg": "ogg",
  "audio/webm": "webm",
  "audio/flac": "flac",
  "audio/x-flac": "flac"
};

// Destinations a user-supplied URL must never reach (SSRF guard).
const blocked = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4]
] as const) {
  blocked.addSubnet(net, prefix, "ipv4");
}
for (const [net, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8]
] as const) {
  blocked.addSubnet(net, prefix, "ipv6");
}

export function isBlockedAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return blocked.check(address, "ipv4");
  if (family !== 6) return true;
  const lower = address.toLowerCase();
  // IPv4-mapped / IPv4-compatible forms (::ffff:a.b.c.d, ::ffff:7f00:1, ::a.b.c.d) are checked as IPv4.
  const mapped = lower.match(/^::(?:ffff:)?(?:0:)?(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return blocked.check(mapped[1], "ipv4");
  const hexMapped = lower.match(/^::(?:ffff:)?([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hexMapped) {
    const hi = parseInt(hexMapped[1], 16);
    const lo = parseInt(hexMapped[2], 16);
    return blocked.check(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`, "ipv4");
  }
  return blocked.check(lower, "ipv6");
}

async function assertPublicHost(hostname: string): Promise<void> {
  const host = hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true, verbatim: true });
  if (addresses.length === 0 || addresses.some((a) => isBlockedAddress(a.address))) {
    throw new Error("audio_url must point to a public host (private, loopback and link-local addresses are not allowed)");
  }
}

function extensionFor(contentType: string | null, pathname: string): string {
  const mime = (contentType ?? "").split(";")[0].trim().toLowerCase();
  if (CONTENT_TYPE_EXTENSIONS[mime]) return CONTENT_TYPE_EXTENSIONS[mime];
  const ext = pathname.split("/").pop()?.split(".").slice(1).pop()?.toLowerCase() ?? "";
  if (SUPPORTED_AUDIO_EXTENSIONS.includes(ext)) return ext;
  throw new Error(
    `could not determine a supported audio format from the download (Content-Type "${mime || "none"}"); ` +
      `supported formats: ${SUPPORTED_AUDIO_EXTENSIONS.join(", ")}. Pass filename with an extension or use audio_base64.`
  );
}

/**
 * Download user-supplied audio with SSRF protection: http(s) only, public hosts only,
 * no redirects, 30s timeout and a 25MB cap enforced on both Content-Length and streamed bytes.
 */
export async function downloadAudio(audioUrl: string): Promise<{ bytes: Uint8Array<ArrayBuffer>; extension: string; basename: string }> {
  let parsed: URL;
  try {
    parsed = new URL(audioUrl);
  } catch {
    throw new Error("audio_url must be a valid http(s) URL");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("audio_url must be an http(s) URL");
  }
  await assertPublicHost(parsed.hostname);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
  try {
    // Redirects are refused so a public URL cannot bounce the request to an internal host.
    const response = await fetch(parsed, { redirect: "manual", signal: controller.signal });
    if (response.status >= 300 && response.status < 400) {
      throw new Error(`audio_url redirects are not allowed (HTTP ${response.status}); pass the final URL`);
    }
    if (!response.ok) throw new Error(`failed to download audio_url: HTTP ${response.status}`);

    const declared = Number(response.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > MAX_AUDIO_BYTES) {
      throw new Error("audio_url exceeds the 25MB limit");
    }

    const chunks: Uint8Array[] = [];
    let total = 0;
    if (response.body) {
      const reader = response.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_AUDIO_BYTES) {
          await reader.cancel().catch(() => undefined);
          throw new Error("audio_url exceeds the 25MB limit");
        }
        chunks.push(value);
      }
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }

    const extension = extensionFor(response.headers.get("content-type"), parsed.pathname);
    const last = parsed.pathname.split("/").pop() ?? "";
    const basename = last.includes(".") ? last.slice(0, last.lastIndexOf(".")) : last;
    return { bytes, extension, basename: basename || "audio" };
  } catch (error) {
    if (controller.signal.aborted) throw new Error("audio_url download timed out after 30s");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
