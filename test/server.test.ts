import { describe, expect, it, vi } from "vitest";
import { DevaMcpServer } from "../src/server.js";
import { RuntimeConfig } from "../src/config.js";
import { ToolPolicyConfig, buildDefaultToolPolicyConfig, normalizeToolPolicyConfig } from "../src/tool-policy.js";
import { ToolContext, ToolDefinition } from "../src/tools/types.js";

interface ToolCallResult {
  isError?: boolean;
  content: Array<{ type: "text"; text: string }>;
}

type CallToolHandler = (
  request: { method: "tools/call"; params: { name: string; arguments?: Record<string, unknown> } },
  extra: unknown
) => Promise<ToolCallResult>;

function makeConfig(toolPolicy: ToolPolicyConfig): RuntimeConfig {
  return {
    apiBase: "https://api.deva.test",
    profile: "default",
    apiKey: "deva_test",
    timeoutMs: 1_000,
    logLevel: "error",
    configPath: "/tmp/deva-config.json",
    configFile: {
      profile: "default",
      api_base: "https://api.deva.test",
      agents: { default: { api_key: "deva_test" } },
      defaults: { timeout_ms: 1_000 },
      tool_policy: toolPolicy
    },
    toolPolicy
  };
}

function makePaidTool(execute: ToolDefinition["execute"]): ToolDefinition {
  return {
    name: "deva_ai_tts",
    description: "Controlled paid test tool.",
    inputSchema: { type: "object", properties: {} },
    execute
  };
}

function makeServer(toolPolicy: ToolPolicyConfig, execute: ToolDefinition["execute"]): DevaMcpServer {
  const server = new DevaMcpServer(makeConfig(toolPolicy));
  (server as unknown as { tools: ToolDefinition[] }).tools = [makePaidTool(execute)];
  return server;
}

async function callTool(server: DevaMcpServer, args: Record<string, unknown> = {}): Promise<ToolCallResult> {
  const handler = (server as unknown as { mcpServer: { _requestHandlers: Map<string, CallToolHandler> } }).mcpServer._requestHandlers.get(
    "tools/call"
  );

  if (!handler) {
    throw new Error("tools/call handler was not registered");
  }

  return handler({ method: "tools/call", params: { name: "deva_ai_tts", arguments: args } }, {});
}

function resultText(result: ToolCallResult): string {
  return result.content[0]?.text ?? "";
}

describe("DevaMcpServer tool policy enforcement", () => {
  it("rejects disabled paid tools at the call_tool boundary", async () => {
    const execute = vi.fn(async () => ({ karma_cost: 1 }));
    const server = makeServer(buildDefaultToolPolicyConfig(), execute);

    const result = await callTool(server);

    expect(result.isError).toBe(true);
    expect(resultText(result)).toContain("disabled by local policy");
    expect(execute).not.toHaveBeenCalled();
  });

  it("fails closed when a paid call succeeds without a parseable cost", async () => {
    const execute = vi.fn(async () => ({ ok: true }));
    const server = makeServer(
      normalizeToolPolicyConfig({
        enabled_tools: ["deva_ai_tts"],
        spend_caps: { session_karma: 5, default_tool_karma: 5 }
      }),
      execute
    );

    const result = await callTool(server);
    const nextResult = await callTool(server);

    expect(result.isError).toBe(true);
    expect(resultText(result)).toContain("without a parseable karma cost");
    expect(nextResult.isError).toBe(true);
    expect(resultText(nextResult)).toContain("per-session karma spend cap");
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("fails closed when a paid call returns an over-cap cost", async () => {
    const execute = vi.fn(async () => ({ karma_cost: 6 }));
    const server = makeServer(
      normalizeToolPolicyConfig({
        enabled_tools: ["deva_ai_tts"],
        spend_caps: { session_karma: 5, default_tool_karma: 5 }
      }),
      execute
    );

    const result = await callTool(server);
    const nextResult = await callTool(server);

    expect(result.isError).toBe(true);
    expect(resultText(result)).toContain("remaining per-session karma spend cap");
    expect(nextResult.isError).toBe(true);
    expect(resultText(nextResult)).toContain("per-session karma spend cap");
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("counts pending paid reservations against concurrent call_tool requests", async () => {
    let resolveFirst!: (payload: unknown) => void;
    const firstPayload = new Promise<unknown>((resolve) => {
      resolveFirst = resolve;
    });
    const execute = vi.fn((_args: Record<string, unknown>, _context: ToolContext) => firstPayload);
    const server = makeServer(
      normalizeToolPolicyConfig({
        enabled_tools: ["deva_ai_tts"],
        spend_caps: { session_karma: 5, default_tool_karma: 5 }
      }),
      execute
    );

    const firstCall = callTool(server);
    expect(execute).toHaveBeenCalledTimes(1);

    const concurrentResult = await callTool(server);
    expect(concurrentResult.isError).toBe(true);
    expect(resultText(concurrentResult)).toContain("per-session karma spend cap");
    expect(execute).toHaveBeenCalledTimes(1);

    resolveFirst({ karma_cost: 1 });
    const firstResult = await firstCall;

    expect(firstResult.isError).toBeUndefined();
    expect(JSON.parse(resultText(firstResult))).toMatchObject({ karma_cost: 1 });
  });
});
