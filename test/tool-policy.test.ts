import { describe, expect, it } from "vitest";
import { DevaError } from "../src/errors.js";
import {
  ToolPolicyEnforcer,
  assertKnownToolPolicies,
  buildDefaultToolPolicyConfig,
  normalizeToolPolicyConfig
} from "../src/tool-policy.js";
import { createAgentTools } from "../src/tools/agent.js";
import { createAiTools } from "../src/tools/ai.js";
import { createBalanceTools } from "../src/tools/balance.js";
import { createCapabilityTools } from "../src/tools/capabilities.js";
import { createCommsTools } from "../src/tools/comms.js";
import { createCronTools } from "../src/tools/cron.js";
import { createGovernanceTools } from "../src/tools/governance.js";
import { createMarketplaceTools } from "../src/tools/marketplace.js";
import { createMessagingTools } from "../src/tools/messaging.js";
import { createServerTools } from "../src/tools/servers.js";
import { createSocialTools } from "../src/tools/social.js";
import { createStorageTools } from "../src/tools/storage.js";
import { createWebhookTools } from "../src/tools/webhooks.js";
import { createWalletTools } from "../src/tools/wallet.js";

function createAllTools() {
  return [
    ...createAgentTools(),
    ...createSocialTools(),
    ...createAiTools(),
    ...createStorageTools(),
    ...createBalanceTools(),
    ...createMessagingTools(),
    ...createCommsTools(),
    ...createWalletTools(),
    ...createGovernanceTools(),
    ...createWebhookTools(),
    ...createCapabilityTools(),
    ...createCronTools(),
    ...createMarketplaceTools(),
    ...createServerTools()
  ];
}

describe("ToolPolicyEnforcer", () => {
  it("has metadata for every registered tool", () => {
    expect(() => assertKnownToolPolicies(createAllTools())).not.toThrow();
  });

  it("allows free read tools and hides paid or state-changing tools by default", () => {
    const policy = new ToolPolicyEnforcer(buildDefaultToolPolicyConfig());

    expect(policy.canList("deva_balance_get")).toBe(true);
    expect(policy.canList("deva_social_feed_get")).toBe(true);
    expect(policy.canList("deva_ai_tts")).toBe(false);
    expect(policy.canList("deva_storage_file_delete")).toBe(false);

    expect(() => policy.assertCanExecute("deva_balance_get")).not.toThrow();
    expect(() => policy.assertCanExecute("deva_ai_tts")).toThrow(/disabled by local policy/);
    expect(() => policy.assertCanExecute("deva_storage_file_delete")).toThrow(/disabled by local policy/);
  });

  it("requires positive caps before executing enabled paid tools", () => {
    const policy = new ToolPolicyEnforcer(
      normalizeToolPolicyConfig({
        enabled_tools: ["deva_ai_tts"]
      })
    );

    expect(policy.canList("deva_ai_tts")).toBe(true);
    expect(() => policy.assertCanExecute("deva_ai_tts")).toThrow(/session_karma/);
  });

  it("tracks returned karma costs against session and per-tool caps", () => {
    const policy = new ToolPolicyEnforcer(
      normalizeToolPolicyConfig({
        enabled_tools: ["deva_ai_tts"],
        spend_caps: {
          session_karma: 5,
          default_tool_karma: 3
        }
      })
    );

    expect(() => policy.assertCanExecute("deva_ai_tts")).not.toThrow();
    policy.recordSpend("deva_ai_tts", { karma_cost: 2 });
    expect(policy.getSessionKarmaSpent()).toBe(2);
    expect(policy.getToolKarmaSpent("deva_ai_tts")).toBe(2);

    expect(() => policy.assertCanExecute("deva_ai_tts")).not.toThrow();
    policy.recordSpend("deva_ai_tts", { data: { karma_cost: 1 } });

    expect(() => policy.assertCanExecute("deva_ai_tts")).toThrow(/per-tool karma spend cap/);
  });

  it("blocks x402 payment challenges that exceed remaining caps", () => {
    const policy = new ToolPolicyEnforcer(
      normalizeToolPolicyConfig({
        enabled_tools: ["deva_ai_tts"],
        spend_caps: {
          session_karma: 5,
          default_tool_karma: 5
        }
      })
    );

    expect(() =>
      policy.assertPaymentChallengeWithinCaps(
        "deva_ai_tts",
        new DevaError({
          status: 402,
          code: "PAYMENT_REQUIRED",
          message: "Payment required",
          paymentChallenge: {
            scheme: "x402",
            network: "base",
            amount: "0.002",
            pay_to: "0xfeed"
          }
        })
      )
    ).not.toThrow();

    expect(() =>
      policy.assertPaymentChallengeWithinCaps(
        "deva_ai_tts",
        new DevaError({
          status: 402,
          code: "PAYMENT_REQUIRED",
          message: "Payment required",
          paymentChallenge: {
            scheme: "x402",
            network: "base",
            amount: "0.01",
            pay_to: "0xfeed"
          }
        })
      )
    ).toThrow(/per-session karma spend cap/);
  });
});
