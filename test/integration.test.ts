import { describe, expect, it } from "vitest";
import { RuntimeConfig } from "../src/config.js";
import { DevaClient } from "../src/deva-client.js";
import { createAgentTools } from "../src/tools/agent.js";
import { createAiTools } from "../src/tools/ai.js";
import { createBalanceTools } from "../src/tools/balance.js";
import { createMessagingTools } from "../src/tools/messaging.js";
import { createSocialTools } from "../src/tools/social.js";
import { createStorageTools } from "../src/tools/storage.js";
import { ToolContext, ToolDefinition } from "../src/tools/types.js";

const apiKey = process.env.DEVA_API_KEY;
const runIntegration = apiKey ? describe : describe.skip;
const apiBase = process.env.DEVA_API_BASE ?? "https://api.deva.me";

function makeConfig(): RuntimeConfig {
  return {
    apiBase,
    profile: "default",
    apiKey,
    timeoutMs: 30_000,
    logLevel: "error",
    configPath: "/tmp/deva-config.json",
    configFile: {
      profile: "default",
      api_base: apiBase,
      agents: { default: { api_key: apiKey } },
      defaults: { timeout_ms: 30_000 }
    }
  };
}

function findTool(tools: ToolDefinition[], name: string): ToolDefinition {
  const tool = tools.find((candidate) => candidate.name === name);
  if (!tool) {
    throw new Error(`missing tool: ${name}`);
  }
  return tool;
}

runIntegration("Deva integration E2E", () => {
  const client = new DevaClient(makeConfig(), () => apiKey);
  const context: ToolContext = { client, auth: {} as never };

  it("tests balance category", async () => {
    const result = await findTool(createBalanceTools(), "deva_balance_get").execute({}, context);
    expect(result).toBeTypeOf("object");
  });

  it("tests agent category", async () => {
    const result = await findTool(createAgentTools(), "deva_agent_me_get").execute({}, context);
    expect(result).toBeTypeOf("object");
  });

  it("tests storage category", async () => {
    const key = `mcp-e2e-${Date.now()}`;
    await findTool(createStorageTools(), "deva_storage_kv_set").execute({ key, value: "hello" }, context);
    const value = await findTool(createStorageTools(), "deva_storage_kv_get").execute({ key }, context);
    expect(value).toBeTypeOf("object");
  });

  it("tests AI category", async () => {
    const result = await findTool(createAiTools(), "deva_ai_tts").execute({ text: "hello world", voice: "nova" }, context);
    expect(result).toBeTypeOf("object");
  });

  it("tests social category", async () => {
    const result = await findTool(createSocialTools(), "deva_social_x_search").execute(
      { query: "deva ai", max_results: 1 },
      context
    );
    expect(result).toBeTypeOf("object");
  });

  it("tests messaging category", async () => {
    const result = await findTool(createMessagingTools(), "deva_messaging_inbox").execute({}, context);
    expect(result).toBeTypeOf("object");
  });

  it("tests catalog and estimate endpoints", async () => {
    const catalog = await findTool(createBalanceTools(), "deva_resources_catalog").execute({}, context);
    const estimate = await findTool(createBalanceTools(), "deva_cost_estimate").execute(
      { resource_id: "tts", params: { text: "hello" } },
      context
    );
    expect(catalog).toBeTypeOf("object");
    expect(estimate).toBeTypeOf("object");
  });
});
