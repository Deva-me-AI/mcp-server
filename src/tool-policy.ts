import { DevaError } from "./errors.js";
import type { PaymentChallenge } from "./errors.js";
import type { ToolDefinition } from "./tools/types.js";

export interface ToolPolicyConfig {
  enabled_tools: string[];
  spend_caps: {
    session_karma: number;
    default_tool_karma: number;
    per_tool_karma: Record<string, number>;
  };
}

export interface ToolSecurityMetadata {
  paid?: boolean;
  destructive?: boolean;
}

interface RemainingBudget {
  session: number;
  tool: number;
}

export interface ToolSpendReservation {
  toolName: string;
  reservedKarma: number;
  state: "pending" | "released" | "settled";
}

const KARMA_PER_USDC = 1000;

const paid = (): ToolSecurityMetadata => ({ paid: true });
const destructive = (): ToolSecurityMetadata => ({ destructive: true });
const paidDestructive = (): ToolSecurityMetadata => ({ paid: true, destructive: true });
const safe = (): ToolSecurityMetadata => ({});

const TOOL_SECURITY: Record<string, ToolSecurityMetadata> = {
  deva_agent_register: destructive(),
  deva_agent_status: safe(),
  deva_agents_discover: safe(),
  deva_agent_me_get: safe(),
  deva_agent_me_update: destructive(),
  deva_agent_profile_get: safe(),
  deva_agent_verify: destructive(),

  deva_social_post_create: paidDestructive(),
  deva_social_feed_get: safe(),
  deva_social_post_get: safe(),
  deva_social_post_replies_get: safe(),
  deva_social_post_react: paidDestructive(),
  deva_social_agents_search: safe(),
  deva_social_follow: destructive(),
  deva_social_unfollow: destructive(),
  deva_social_followers_get: safe(),
  deva_social_following_get: safe(),
  deva_social_x_search: paid(),
  deva_social_prompt: paidDestructive(),
  deva_social_x_user_tweets: paid(),

  deva_ai_tts: paid(),
  deva_ai_image_generate: paid(),
  deva_ai_embeddings: paid(),
  deva_ai_vision_analyze: paid(),
  deva_ai_web_search: paid(),
  deva_ai_llm_completion: paid(),
  deva_ai_transcription: paid(),

  deva_storage_kv_set: paidDestructive(),
  deva_storage_kv_get: safe(),
  deva_storage_kv_delete: paidDestructive(),
  deva_storage_kv_list: safe(),
  deva_storage_file_upload: paidDestructive(),
  deva_storage_file_download: safe(),
  deva_storage_file_delete: paidDestructive(),
  deva_storage_file_list: safe(),

  deva_balance_get: safe(),
  deva_cost_estimate: safe(),
  deva_resources_catalog: safe(),
  deva_resource_inspect: safe(),
  deva_resource_run: paid(),

  deva_messaging_send: paidDestructive(),
  deva_messaging_inbox: safe(),
  deva_messaging_outbox: safe(),
  deva_messaging_reply: paidDestructive(),
  deva_messaging_mark_read: destructive(),
  deva_messaging_delete: paidDestructive(),
  deva_messaging_thread_get: safe(),

  deva_comms_email_send: paidDestructive(),
  deva_gas_faucet: paidDestructive(),

  deva_feature_request_submit: paidDestructive(),
  deva_feature_request_vote: paidDestructive(),

  deva_webhook_register: paidDestructive(),
  deva_webhook_list: safe(),
  deva_webhook_update: paidDestructive(),
  deva_webhook_delete: paidDestructive(),

  deva_capability_register: paidDestructive(),
  deva_capability_search: safe(),
  deva_capability_list: safe(),
  deva_capability_update: paidDestructive(),
  deva_capability_delete: paidDestructive(),

  deva_cron_create: paidDestructive(),
  deva_cron_list: safe(),
  deva_cron_update: paidDestructive(),
  deva_cron_delete: paidDestructive(),
  deva_cron_runs: safe(),

  deva_marketplace_browse: safe(),
  deva_marketplace_listing_create: paidDestructive(),
  deva_marketplace_listing_get: safe(),
  deva_marketplace_listing_update: paidDestructive(),
  deva_marketplace_listing_delete: paidDestructive(),
  deva_marketplace_hire: paidDestructive(),
  deva_marketplace_hires_list: safe(),
  deva_marketplace_hire_accept: paidDestructive(),
  deva_marketplace_hire_decline: paidDestructive(),
  deva_marketplace_hire_deliver: paidDestructive(),
  deva_marketplace_hire_accept_delivery: paidDestructive(),
  deva_marketplace_hire_cancel: paidDestructive(),

  deva_server_provision: paidDestructive(),
  deva_server_list: safe(),
  deva_server_delete: paidDestructive()
};

export function buildDefaultToolPolicyConfig(): ToolPolicyConfig {
  return {
    enabled_tools: [],
    spend_caps: {
      session_karma: 0,
      default_tool_karma: 0,
      per_tool_karma: {}
    }
  };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : undefined;
}

function parseNonNegativeNumber(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return 0;
  }
  return value;
}

function parseToolList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0))];
}

function parsePerToolCaps(value: unknown): Record<string, number> {
  const raw = asRecord(value);
  if (!raw) {
    return {};
  }

  const caps: Record<string, number> = {};
  for (const [toolName, cap] of Object.entries(raw)) {
    const parsed = parseNonNegativeNumber(cap);
    if (parsed > 0) {
      caps[toolName] = parsed;
    }
  }
  return caps;
}

export function normalizeToolPolicyConfig(value: unknown): ToolPolicyConfig {
  const raw = asRecord(value);
  const spendCaps = asRecord(raw?.spend_caps);

  return {
    enabled_tools: parseToolList(raw?.enabled_tools),
    spend_caps: {
      session_karma: parseNonNegativeNumber(spendCaps?.session_karma),
      default_tool_karma: parseNonNegativeNumber(spendCaps?.default_tool_karma),
      per_tool_karma: parsePerToolCaps(spendCaps?.per_tool_karma)
    }
  };
}

export function assertKnownToolPolicies(tools: ToolDefinition[]): void {
  const missing = tools.map((tool) => tool.name).filter((name) => TOOL_SECURITY[name] === undefined);
  if (missing.length > 0) {
    throw new Error(`Missing local security policy metadata for tools: ${missing.join(", ")}`);
  }
}

export function getToolSecurityMetadata(toolName: string): ToolSecurityMetadata {
  return TOOL_SECURITY[toolName] ?? { paid: true, destructive: true };
}

function isRestricted(metadata: ToolSecurityMetadata): boolean {
  return metadata.paid === true || metadata.destructive === true;
}

function asPositiveFiniteNumber(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }
  return value;
}

function parseKarmaCost(value: unknown): number | undefined {
  if (typeof value === "number") {
    return asPositiveFiniteNumber(value);
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return asPositiveFiniteNumber(parsed);
  }

  return undefined;
}

export function extractKarmaCost(payload: unknown): number | undefined {
  const record = asRecord(payload);
  if (!record) {
    return undefined;
  }

  for (const key of ["karma_cost", "karmaCost", "cost_karma"]) {
    const cost = parseKarmaCost(record[key]);
    if (cost !== undefined) {
      return cost;
    }
  }

  return extractKarmaCost(record.data);
}

function challengeAmountToKarma(challenge: PaymentChallenge | undefined): number | undefined {
  const amount = parseKarmaCost(challenge?.amount);
  if (amount === undefined) {
    return undefined;
  }

  return amount * KARMA_PER_USDC;
}

export class ToolPolicyEnforcer {
  private readonly enabledTools: Set<string>;
  private sessionKarmaSpent = 0;
  private sessionKarmaPending = 0;
  private readonly toolKarmaSpent = new Map<string, number>();
  private readonly toolKarmaPending = new Map<string, number>();

  constructor(private readonly config: ToolPolicyConfig) {
    this.enabledTools = new Set(config.enabled_tools);
  }

  canList(toolName: string): boolean {
    const metadata = getToolSecurityMetadata(toolName);
    return !isRestricted(metadata) || this.enabledTools.has(toolName);
  }

  assertCanExecute(toolName: string): void {
    const metadata = getToolSecurityMetadata(toolName);

    if (isRestricted(metadata) && !this.enabledTools.has(toolName)) {
      throw this.denied(
        `Tool '${toolName}' is disabled by local policy. Add it to tool_policy.enabled_tools to enable paid or state-changing tools.`
      );
    }

    if (metadata.paid) {
      this.assertPaidBudgetConfigured(toolName);
      this.assertBudgetAvailable(toolName, 0);
    }
  }

  reserveSpend(toolName: string): ToolSpendReservation | undefined {
    this.assertCanExecute(toolName);

    if (!getToolSecurityMetadata(toolName).paid) {
      return undefined;
    }

    const remaining = this.getRemainingBudget(toolName);
    const reservedKarma = Math.min(remaining.session, remaining.tool);
    this.assertBudgetAvailable(toolName, reservedKarma);

    const reservation: ToolSpendReservation = {
      toolName,
      reservedKarma,
      state: "pending"
    };

    this.sessionKarmaPending += reservedKarma;
    this.toolKarmaPending.set(toolName, this.getToolKarmaPending(toolName) + reservedKarma);

    return reservation;
  }

  settleSpend(reservation: ToolSpendReservation | undefined, payload: unknown): number | undefined {
    if (!reservation) {
      return undefined;
    }

    const toolName = reservation.toolName;
    const cost = extractKarmaCost(payload);
    if (cost === undefined) {
      this.settleReservation(reservation, reservation.reservedKarma);
      throw this.denied(
        `Paid tool '${toolName}' completed without a parseable karma cost; the reserved ${reservation.reservedKarma} karma was counted against local spend caps because the actual cost cannot be verified.`
      );
    }

    const remaining = this.getRemainingBudgetAfterReleasing(reservation);
    const capError = this.getCapExceededError(toolName, cost, remaining);
    this.settleReservation(reservation, cost);
    if (capError) {
      throw capError;
    }

    return cost;
  }

  releaseSpend(reservation: ToolSpendReservation | undefined): void {
    if (!reservation || reservation.state !== "pending") {
      return;
    }

    reservation.state = "released";
    this.sessionKarmaPending = Math.max(0, this.sessionKarmaPending - reservation.reservedKarma);
    this.toolKarmaPending.set(
      reservation.toolName,
      Math.max(0, this.getToolKarmaPending(reservation.toolName) - reservation.reservedKarma)
    );
  }

  recordSpend(toolName: string, payload: unknown): number | undefined {
    if (!getToolSecurityMetadata(toolName).paid) {
      return undefined;
    }

    const cost = extractKarmaCost(payload);
    if (cost === undefined) {
      throw this.denied(`Paid tool '${toolName}' completed without a parseable karma cost, so local spend caps cannot be enforced.`);
    }

    this.assertPaidBudgetConfigured(toolName);
    const capError = this.getCapExceededError(toolName, cost, this.getRemainingBudget(toolName));
    this.sessionKarmaSpent += cost;
    this.toolKarmaSpent.set(toolName, this.getToolKarmaSpent(toolName) + cost);
    if (capError) {
      throw capError;
    }

    return cost;
  }

  assertPaymentChallengeWithinCaps(toolName: string, error: unknown): void {
    if (!(error instanceof DevaError)) {
      return;
    }

    if (!getToolSecurityMetadata(toolName).paid || (error.status !== 402 && error.code !== "PAYMENT_REQUIRED")) {
      return;
    }

    this.assertPaidBudgetConfigured(toolName);

    const challengeKarma = challengeAmountToKarma(error.paymentChallenge);
    if (challengeKarma === undefined) {
      throw this.denied(`Payment challenge for '${toolName}' did not include a parseable amount, so local spend caps cannot be enforced.`);
    }

    this.assertBudgetAvailable(toolName, challengeKarma);
  }

  getSessionKarmaSpent(): number {
    return this.sessionKarmaSpent;
  }

  getSessionKarmaPending(): number {
    return this.sessionKarmaPending;
  }

  getToolKarmaSpent(toolName: string): number {
    return this.toolKarmaSpent.get(toolName) ?? 0;
  }

  getToolKarmaPending(toolName: string): number {
    return this.toolKarmaPending.get(toolName) ?? 0;
  }

  private assertPaidBudgetConfigured(toolName: string): void {
    if (this.config.spend_caps.session_karma <= 0) {
      throw this.denied(`Paid tool '${toolName}' requires a positive tool_policy.spend_caps.session_karma value.`);
    }

    if (this.getToolCap(toolName) <= 0) {
      throw this.denied(
        `Paid tool '${toolName}' requires a positive tool_policy.spend_caps.default_tool_karma or per-tool cap.`
      );
    }
  }

  private assertBudgetAvailable(toolName: string, pendingKarma: number): void {
    const remaining = this.getRemainingBudget(toolName);

    if (remaining.session <= 0 || pendingKarma > remaining.session) {
      throw this.denied(`Paid tool '${toolName}' would exceed the per-session karma spend cap.`);
    }

    if (remaining.tool <= 0 || pendingKarma > remaining.tool) {
      throw this.denied(`Paid tool '${toolName}' would exceed its per-tool karma spend cap.`);
    }
  }

  private getCapExceededError(toolName: string, cost: number, remaining: RemainingBudget): DevaError | undefined {
    if (cost > remaining.session) {
      return this.denied(
        `Paid tool '${toolName}' returned a karma cost of ${cost}, which would exceed the remaining per-session karma spend cap.`
      );
    }

    if (cost > remaining.tool) {
      return this.denied(
        `Paid tool '${toolName}' returned a karma cost of ${cost}, which would exceed its remaining per-tool karma spend cap.`
      );
    }

    return undefined;
  }

  private settleReservation(reservation: ToolSpendReservation, cost: number): void {
    if (reservation.state !== "pending") {
      return;
    }

    reservation.state = "settled";
    this.sessionKarmaPending = Math.max(0, this.sessionKarmaPending - reservation.reservedKarma);
    this.toolKarmaPending.set(
      reservation.toolName,
      Math.max(0, this.getToolKarmaPending(reservation.toolName) - reservation.reservedKarma)
    );
    this.sessionKarmaSpent += cost;
    this.toolKarmaSpent.set(reservation.toolName, this.getToolKarmaSpent(reservation.toolName) + cost);
  }

  private getRemainingBudget(toolName: string): RemainingBudget {
    return {
      session: this.config.spend_caps.session_karma - this.sessionKarmaSpent - this.sessionKarmaPending,
      tool: this.getToolCap(toolName) - this.getToolKarmaSpent(toolName) - this.getToolKarmaPending(toolName)
    };
  }

  private getRemainingBudgetAfterReleasing(reservation: ToolSpendReservation): RemainingBudget {
    const pendingSessionRelease = reservation.state === "pending" ? reservation.reservedKarma : 0;
    const pendingToolRelease = reservation.state === "pending" ? reservation.reservedKarma : 0;

    return {
      session:
        this.config.spend_caps.session_karma - this.sessionKarmaSpent - Math.max(0, this.sessionKarmaPending - pendingSessionRelease),
      tool:
        this.getToolCap(reservation.toolName) -
        this.getToolKarmaSpent(reservation.toolName) -
        Math.max(0, this.getToolKarmaPending(reservation.toolName) - pendingToolRelease)
    };
  }

  private getToolCap(toolName: string): number {
    return this.config.spend_caps.per_tool_karma[toolName] ?? this.config.spend_caps.default_tool_karma;
  }

  private denied(message: string): DevaError {
    return new DevaError({
      code: "TOOL_POLICY_DENIED",
      message
    });
  }
}
