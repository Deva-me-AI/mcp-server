import { afterEach, describe, expect, it, vi } from "vitest";
import { createAgentTools } from "../src/tools/agent.js";
import { createAiTools } from "../src/tools/ai.js";
import { createBalanceTools } from "../src/tools/balance.js";
import { createCapabilityTools } from "../src/tools/capabilities.js";
import { createCommsTools } from "../src/tools/comms.js";
import { createMessagingTools } from "../src/tools/messaging.js";
import { createServerTools } from "../src/tools/servers.js";
import type { ToolDefinition } from "../src/tools/types.js";

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
    const call = await run(createAiTools(), "deva_ai_transcription", {
      audio_base64: Buffer.from(audio).toString("base64"),
      filename: "talk.m4a",
      language: "en"
    });
    expect(call.method).toBe("POST");
    expect(call.path).toBe("/v1/ai/transcribe");
    const form = call.body as FormData;
    expect(form).toBeInstanceOf(FormData);
    const file = form.get("file") as File;
    expect(file.name).toBe("talk.m4a");
    expect(file.type).toBe("audio/mp4");
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(audio);
    expect(form.get("language")).toBe("en");

    const noLang = await run(createAiTools(), "deva_ai_transcription", { audio_base64: "eHl6", filename: "a.FLAC" });
    expect(((noLang.body as FormData).get("file") as File).type).toBe("audio/flac");
    expect((noLang.body as FormData).get("language")).toBeNull();
  });

  it("deva_ai_transcription rejects audio_url without any network call", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { calls, context } = harness();
    const tool = createAiTools().find((t) => t.name === "deva_ai_transcription")!;
    expect(Object.keys((tool.inputSchema as { properties: object }).properties)).not.toContain("audio_url");
    for (const args of [
      { audio_url: "https://example.com/a.mp3" },
      { audio_url: "http://169.254.169.254/latest/meta-data", audio_base64: "eHl6", filename: "a.mp3" }
    ]) {
      await expect(tool.execute(args, context as never)).rejects.toThrow(
        "audio_url is not supported; pass audio_base64 (and filename with an extension)"
      );
    }
    expect(fetchMock).not.toHaveBeenCalled();
    expect(calls).toHaveLength(0);
  });

  it("deva_ai_transcription requires audio_base64 and a supported filename extension", async () => {
    const { calls, context } = harness();
    const tool = createAiTools().find((t) => t.name === "deva_ai_transcription")!;
    await expect(tool.execute({}, context as never)).rejects.toThrow(/audio_base64 is required/);
    await expect(tool.execute({ audio_base64: "eHl6" }, context as never)).rejects.toThrow(/filename is required/);
    for (const filename of ["clip", "clip.txt", "clip.mp3.exe", "mp3"]) {
      await expect(tool.execute({ audio_base64: "eHl6", filename }, context as never)).rejects.toThrow(
        /supported formats: mp3, mp4, mpeg, mpga, m4a, wav, webm, ogg, flac/
      );
    }
    await expect(tool.execute({ audio_base64: "not base64!", filename: "a.mp3" }, context as never)).rejects.toThrow(
      /not valid base64/
    );
    expect(calls).toHaveLength(0);
  });

  it("deva_ai_transcription rejects audio over 25MB before any request", async () => {
    const { calls, context } = harness();
    const tool = createAiTools().find((t) => t.name === "deva_ai_transcription")!;
    // Base64 length bound trips before decoding.
    const tooLong = "A".repeat(Math.ceil((25 * 1024 * 1024) / 3) * 4 + 4);
    await expect(tool.execute({ audio_base64: tooLong, filename: "a.wav" }, context as never)).rejects.toThrow(/25MB/);
    // Decoded byte bound: 25MB + 1 byte stays within the base64 length bound (same quad count) but is rejected after decoding.
    const over = Buffer.alloc(25 * 1024 * 1024 + 1).toString("base64");
    await expect(tool.execute({ audio_base64: over, filename: "a.wav" }, context as never)).rejects.toThrow(/25MB/);
    expect(calls).toHaveLength(0);

    const exact = Buffer.alloc(25 * 1024 * 1024).toString("base64");
    await tool.execute({ audio_base64: exact, filename: "a.wav" }, context as never);
    expect(calls).toHaveLength(1);
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
