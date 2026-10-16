import { afterEach, describe, expect, it, vi } from "vitest";
import { createAgentTools } from "../src/tools/agent.js";
import { createAiTools } from "../src/tools/ai.js";
import { createBalanceTools } from "../src/tools/balance.js";
import { createCapabilityTools } from "../src/tools/capabilities.js";
import { createCommsTools } from "../src/tools/comms.js";
import { createMessagingTools } from "../src/tools/messaging.js";
import { createServerTools } from "../src/tools/servers.js";
import type { ToolDefinition } from "../src/tools/types.js";

const dnsLookup = vi.hoisted(() => vi.fn(async (_host: string, _opts?: unknown) => [{ address: "93.184.215.14", family: 4 }]));
vi.mock("node:dns/promises", () => ({ lookup: dnsLookup }));

// Each assertion mirrors the live API route (method + path + request schema).
// The previous paths all returned 404 on api.deva.me.

interface Call {
  method: string;
  path: string;
  query?: Record<string, unknown>;
  body?: unknown;
}

function harness() {
  const calls: Call[] = [];
  const context = {
    client: {
      request: async (options: Call) => {
        calls.push(options);
        return {};
      }
    },
    auth: {} as never
  };
  return { calls, context };
}

async function run(tools: ToolDefinition[], name: string, args: Record<string, unknown>): Promise<Call> {
  const { calls, context } = harness();
  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new Error(`missing tool ${name}`);
  await tool.execute(args, context as never);
  expect(calls).toHaveLength(1);
  return calls[0];
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("route fixes", () => {
  it("deva_ai_llm_completion -> POST /v1/chat/completions", async () => {
    const call = await run(createAiTools(), "deva_ai_llm_completion", {
      model: "openai/gpt-4o-mini",
      messages: [{ role: "user", content: "hi" }],
      max_tokens: 5
    });
    expect(call.method).toBe("POST");
    expect(call.path).toBe("/v1/chat/completions");
    expect(call.body).toMatchObject({ model: "openai/gpt-4o-mini", max_tokens: 5 });
  });

  it("deva_ai_transcription -> POST /v1/ai/transcribe as multipart file + language", async () => {
    const audio = new Uint8Array([1, 2, 3, 4]);
    const fetchMock = vi.fn(async () => new Response(audio, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const call = await run(createAiTools(), "deva_ai_transcription", {
      audio_url: "https://example.com/clips/talk.m4a",
      language: "en"
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(call.method).toBe("POST");
    expect(call.path).toBe("/v1/ai/transcribe");
    expect(call.body).toBeInstanceOf(FormData);
    const form = call.body as FormData;
    const file = form.get("file") as File;
    expect(file).toBeInstanceOf(Blob);
    expect(file.name).toBe("talk.m4a");
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(audio);
    expect(form.get("language")).toBe("en");
  });

  it("deva_ai_transcription accepts base64 audio and rejects missing input", async () => {
    const call = await run(createAiTools(), "deva_ai_transcription", { audio_base64: Buffer.from("xyz").toString("base64") });
    const file = (call.body as FormData).get("file") as File;
    expect(file.name).toBe("audio.mp3");
    expect((call.body as FormData).get("language")).toBeNull();

    const tool = createAiTools().find((t) => t.name === "deva_ai_transcription")!;
    await expect(tool.execute({}, harness().context as never)).rejects.toThrow(/audio_url or audio_base64/);
    await expect(tool.execute({ audio_url: "file:///etc/passwd" }, harness().context as never)).rejects.toThrow(/http/);
  });

  it("deva_ai_transcription audio_url download rejects private hosts, redirects and oversize bodies", async () => {
    const tool = createAiTools().find((t) => t.name === "deva_ai_transcription")!;
    const ctx = harness().context as never;
    const fetchMock = vi.fn(async () => new Response(new Uint8Array([1]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    // Private / loopback / link-local / mapped addresses, by literal and via DNS.
    for (const url of [
      "http://127.0.0.1/a.mp3",
      "http://169.254.169.254/latest/meta-data",
      "http://[::1]/a.mp3",
      "http://[::ffff:10.0.0.1]/a.mp3",
      "http://[fd00::1]/a.mp3"
    ]) {
      await expect(tool.execute({ audio_url: url }, ctx)).rejects.toThrow(/public host/);
    }
    dnsLookup.mockResolvedValueOnce([
      { address: "93.184.215.14", family: 4 },
      { address: "192.168.1.5", family: 4 }
    ]);
    await expect(tool.execute({ audio_url: "https://internal.example.com/a.mp3" }, ctx)).rejects.toThrow(/public host/);
    expect(fetchMock).not.toHaveBeenCalled();

    // Redirects are refused (fetch is called with redirect: manual).
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: "http://127.0.0.1/" } }));
    await expect(tool.execute({ audio_url: "https://example.com/a.mp3" }, ctx)).rejects.toThrow(/redirects are not allowed/);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ redirect: "manual" });

    // Oversize via Content-Length and via streamed bytes without a declared length.
    fetchMock.mockResolvedValueOnce(
      new Response(new Uint8Array([1]), { status: 200, headers: { "content-length": String(26 * 1024 * 1024) } })
    );
    await expect(tool.execute({ audio_url: "https://example.com/a.mp3" }, ctx)).rejects.toThrow(/25MB/);
    const chunk = new Uint8Array(1024 * 1024);
    let sent = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent++ < 30) controller.enqueue(chunk);
        else controller.close();
      }
    });
    fetchMock.mockResolvedValueOnce(new Response(stream, { status: 200 }));
    await expect(tool.execute({ audio_url: "https://example.com/a.mp3" }, ctx)).rejects.toThrow(/25MB/);
  });

  it("deva_ai_transcription derives the upload extension from Content-Type, else URL, else rejects", async () => {
    const fetchMock = vi.fn(async () => new Response(new Uint8Array([1]), { status: 200, headers: { "content-type": "audio/x-wav" } }));
    vi.stubGlobal("fetch", fetchMock);
    const call = await run(createAiTools(), "deva_ai_transcription", { audio_url: "https://example.com/stream/clip" });
    expect(((call.body as FormData).get("file") as File).name).toBe("clip.wav");

    fetchMock.mockResolvedValueOnce(new Response(new Uint8Array([1]), { status: 200, headers: { "content-type": "application/octet-stream" } }));
    const tool = createAiTools().find((t) => t.name === "deva_ai_transcription")!;
    await expect(tool.execute({ audio_url: "https://example.com/download?id=1" }, harness().context as never)).rejects.toThrow(
      /supported formats: mp3, mp4, mpeg, mpga, m4a, wav, webm, ogg, flac/
    );
  });

  it("deva_comms_email_send -> POST /v1/comms/email/send with body_text/body_html", async () => {
    const call = await run(createCommsTools(), "deva_comms_email_send", {
      to: ["a@example.com"],
      subject: "S",
      body_html: "<p>x</p>"
    });
    expect(call).toEqual({
      method: "POST",
      path: "/v1/comms/email/send",
      body: { to: ["a@example.com"], subject: "S", body_text: undefined, body_html: "<p>x</p>", reply_to: undefined }
    });

    const legacy = await run(createCommsTools(), "deva_comms_email_send", { to: ["a@example.com"], subject: "S", body: "plain" });
    expect(legacy.body).toMatchObject({ body_text: "plain" });
  });

  it("deva_balance_get -> GET /v1/agents/balance with optional unit", async () => {
    const call = await run(createBalanceTools(), "deva_balance_get", { unit: "karma" });
    expect(call).toEqual({ method: "GET", path: "/v1/agents/balance", query: { unit: "karma" } });
  });

  it("deva_agent_me_update -> PUT /v1/agents/profile with only schema fields", async () => {
    const call = await run(createAgentTools(), "deva_agent_me_update", { bio: "hello", tags: ["a"], unknown: 1 });
    expect(call).toEqual({ method: "PUT", path: "/v1/agents/profile", body: { bio: "hello", tags: ["a"] } });

    const { calls, context } = harness();
    const tool = createAgentTools().find((t) => t.name === "deva_agent_me_update")!;
    await expect(tool.execute({ unknown: 1 }, context as never)).rejects.toThrow(/at least one of/);
    expect(calls).toHaveLength(0);
  });

  it("deva_capability_list -> GET /v1/agents/capabilities; search -> /v1/agents/capabilities/search", async () => {
    const list = await run(createCapabilityTools(), "deva_capability_list", {});
    expect(list).toEqual({ method: "GET", path: "/v1/agents/capabilities" });

    const search = await run(createCapabilityTools(), "deva_capability_search", { q: "pdf", limit: 5 });
    expect(search).toEqual({ method: "GET", path: "/v1/agents/capabilities/search?q=pdf&limit=5" });
  });

  it("deva_messaging_inbox -> GET /v1/agents/messages/inbox with server query params", async () => {
    const call = await run(createMessagingTools(), "deva_messaging_inbox", { status: "unread", from: "bob", offset: 20, limit: 10 });
    expect(call).toEqual({
      method: "GET",
      path: "/v1/agents/messages/inbox",
      query: { status: "unread", from: "bob", thread_id: undefined, since: undefined, offset: 20, limit: 10 }
    });
  });

  it("deva_server_provision -> POST /v1/agents/servers/provision with lowercase size", async () => {
    const call = await run(createServerTools(), "deva_server_provision", { size: "small", name: "box-1" });
    expect(call).toEqual({
      method: "POST",
      path: "/v1/agents/servers/provision",
      body: { size: "small", name: "box-1", region: undefined }
    });

    const legacy = await run(createServerTools(), "deva_server_provision", { tier: "MEDIUM" });
    expect(legacy.body).toMatchObject({ size: "medium" });
  });
});
