import { describe, expect, it } from "vitest";
import { createAgentTools } from "../src/tools/agent.js";
import { createAiTools } from "../src/tools/ai.js";
import { createBalanceTools } from "../src/tools/balance.js";
import { createCommsTools } from "../src/tools/comms.js";
import { createGovernanceTools } from "../src/tools/governance.js";
import { createMessagingTools } from "../src/tools/messaging.js";
import { createSocialTools } from "../src/tools/social.js";
import { createStorageTools } from "../src/tools/storage.js";
import { createWalletTools } from "../src/tools/wallet.js";

describe("tool inventory", () => {
  it("includes all required tools", () => {
    const all = [
      ...createAgentTools(),
      ...createSocialTools(),
      ...createAiTools(),
      ...createStorageTools(),
      ...createBalanceTools(),
      ...createMessagingTools(),
      ...createCommsTools(),
      ...createWalletTools(),
      ...createGovernanceTools()
    ];

    expect(all).toHaveLength(49);
    expect(new Set(all.map((t) => t.name)).size).toBe(49);
  });

  it("includes required balance and pricing tools", () => {
    const balanceTools = createBalanceTools();
    const names = new Set(balanceTools.map((tool) => tool.name));

    expect(names.has("deva_balance_get")).toBe(true);
    expect(names.has("deva_cost_estimate")).toBe(true);
    expect(names.has("deva_resources_catalog")).toBe(true);
  });

  it("maps balance tools to expected resource endpoints", async () => {
    const calls: Array<{ method: string; path: string }> = [];
    const context = {
      client: {
        request: async (options: { method: string; path: string }) => {
          calls.push({ method: options.method, path: options.path });
          return {};
        }
      },
      auth: {} as never
    };

    const tools = createBalanceTools();
    await tools.find((tool) => tool.name === "deva_balance_get")!.execute({}, context);
    await tools.find((tool) => tool.name === "deva_cost_estimate")!.execute({}, context);
    await tools.find((tool) => tool.name === "deva_resources_catalog")!.execute({}, context);

    expect(calls[0]).toEqual({ method: "GET", path: "/v1/agents/karma/balance" });
    expect(calls[1]).toEqual({ method: "POST", path: "/v1/agents/resources/estimate" });
    expect(calls[2]).toEqual({ method: "GET", path: "/v1/agents/resources/catalog" });
  });

  it("uses updated pricing in paid tool descriptions", () => {
    const aiTools = createAiTools();
    const storageTools = createStorageTools();
    const messagingTools = createMessagingTools();
    const socialTools = createSocialTools();
    const commsTools = createCommsTools();
    const walletTools = createWalletTools();
    const governanceTools = createGovernanceTools();
    const byName = new Map(
      [...aiTools, ...storageTools, ...messagingTools, ...socialTools, ...commsTools, ...walletTools, ...governanceTools].map(
        (tool) => [tool.name, tool.description] as const
      )
    );

    expect(byName.get("deva_ai_tts")).toContain("1₭ ($0.001) per 100 chars");
    expect(byName.get("deva_ai_image_generate")).toContain("80₭ ($0.08)");
    expect(byName.get("deva_ai_image_generate")).toContain("160₭ ($0.16)");
    expect(byName.get("deva_ai_embeddings")).toContain("1₭ ($0.001) per 1K tokens");
    expect(byName.get("deva_ai_vision_analyze")).toContain("20₭ ($0.02) per image");
    expect(byName.get("deva_ai_web_search")).toContain("10₭ ($0.01) per search");
    expect(byName.get("deva_storage_kv_set")).toContain("1₭ ($0.001) per write");
    expect(byName.get("deva_storage_file_upload")).toContain("1₭ ($0.001) per upload");
    expect(byName.get("deva_messaging_send")).toContain("1₭ ($0.001) per send");
    expect(byName.get("deva_messaging_reply")).toContain("1₭ ($0.001) per reply");
    expect(byName.get("deva_social_x_search")).toContain("10₭ ($0.01) per search");
    expect(byName.get("deva_ai_transcription")).toContain("5₭ ($0.005) per 24s audio");
    expect(byName.get("deva_ai_llm_completion")).toContain("about 20₭ ($0.02) base");
    expect(byName.get("deva_social_x_user_tweets")).toContain("10₭ ($0.01) per request");
    expect(byName.get("deva_comms_email_send")).toContain("1₭ ($0.001) per email");
    expect(byName.get("deva_gas_faucet")).toContain("350₭ ($0.35) per drip");
    expect(byName.get("deva_feature_request_submit")).toContain("5₭ ($0.005) per submission");
    expect(byName.get("deva_feature_request_vote")).toContain("1₭ ($0.001) per vote");
  });

  it("maps newly added tools to expected endpoints", async () => {
    const calls: Array<{ method: string; path: string; query?: Record<string, unknown>; body?: Record<string, unknown> }> = [];
    const context = {
      client: {
        request: async (options: {
          method: string;
          path: string;
          query?: Record<string, unknown>;
          body?: Record<string, unknown>;
        }) => {
          calls.push({ method: options.method, path: options.path, query: options.query, body: options.body });
          return {};
        }
      },
      auth: {} as never
    };

    await createAgentTools().find((tool) => tool.name === "deva_agents_discover")!.execute({}, context);
    await createSocialTools().find((tool) => tool.name === "deva_social_prompt")!.execute(
      { target: "truejaian", message: "hello" },
      context
    );
    await createSocialTools().find((tool) => tool.name === "deva_social_x_user_tweets")!.execute({ username: "deva_ai" }, context);
    await createAiTools()
      .find((tool) => tool.name === "deva_ai_llm_completion")!
      .execute({ model: "openai/gpt-4o-mini", messages: [{ role: "user", content: "hello" }] }, context);
    await createAiTools()
      .find((tool) => tool.name === "deva_ai_transcription")!
      .execute({ audio_url: "https://example.com/audio.mp3" }, context);
    await createCommsTools()
      .find((tool) => tool.name === "deva_comms_email_send")!
      .execute({ to: ["hello@example.com"], subject: "Test", body: "Hello" }, context);
    await createWalletTools()
      .find((tool) => tool.name === "deva_gas_faucet")!
      .execute({ wallet_address: "0x0000000000000000000000000000000000000001" }, context);
    await createGovernanceTools()
      .find((tool) => tool.name === "deva_feature_request_submit")!
      .execute({ title: "Add docs", description: "Please add docs" }, context);
    await createGovernanceTools().find((tool) => tool.name === "deva_feature_request_vote")!.execute({ request_id: "req_123" }, context);

    expect(calls[0]).toEqual({ method: "GET", path: "/agents/discover", query: { limit: 20, offset: 0 }, body: undefined });
    expect(calls[1]).toEqual({
      method: "POST",
      path: "/agents/prompt",
      query: undefined,
      body: { target: "truejaian", message: "hello" }
    });
    expect(calls[2]).toEqual({
      method: "POST",
      path: "/tools/x/user-tweets",
      query: undefined,
      body: { username: "deva_ai", limit: 10 }
    });
    expect(calls[3]).toEqual({
      method: "POST",
      path: "/chat/completions",
      query: undefined,
      body: { model: "openai/gpt-4o-mini", messages: [{ role: "user", content: "hello" }], max_tokens: undefined, temperature: undefined }
    });
    expect(calls[4]).toEqual({
      method: "POST",
      path: "/ai/transcribe",
      query: undefined,
      body: { audio_url: "https://example.com/audio.mp3", language: undefined }
    });
    expect(calls[5]).toEqual({
      method: "POST",
      path: "/comms/email/send",
      query: undefined,
      body: { to: ["hello@example.com"], subject: "Test", body: "Hello", reply_to: undefined }
    });
    expect(calls[6]).toEqual({
      method: "POST",
      path: "/agents/gas-faucet",
      query: undefined,
      body: { wallet_address: "0x0000000000000000000000000000000000000001" }
    });
    expect(calls[7]).toEqual({
      method: "POST",
      path: "/v1/agents/features",
      query: undefined,
      body: { title: "Add docs", description: "Please add docs" }
    });
    expect(calls[8]).toEqual({ method: "POST", path: "/v1/agents/features/req_123/vote", query: undefined, body: undefined });
  });
});
