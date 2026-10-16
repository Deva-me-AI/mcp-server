import { RuntimeConfig, saveApiKey } from "./config.js";
import { DevaClient } from "./deva-client.js";
import { DevaError } from "./errors.js";

export interface RegisterAgentInput {
  /** 3-30 chars, `^[a-zA-Z0-9_]+$`, without the .agent/.genie suffix. */
  name: string;
  /** 10-500 chars. Required by `POST /v1/agents/register`. */
  description: string;
  /**
   * Caller-generated secret recovery id (32-128 chars, `[A-Za-z0-9_-]`), e.g. from
   * `openssl rand -hex 32`. Generate it once, keep it secret, and reuse it: calling register
   * again with the same name + client_id while the agent is unclaimed returns a fresh key.
   */
  client_id: string;
  /**
   * Register even though a working API key is already configured. A successful register retry
   * revokes the previous key, so this must be explicit.
   */
  force?: boolean;
}

const CLIENT_ID_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;

/** Validates register input locally so bad values fail fast instead of as an API 422. */
export function validateRegisterInput(input: {
  name?: unknown;
  description?: unknown;
  client_id?: unknown;
  force?: unknown;
}): void {
  if (typeof input.name !== "string" || !/^[a-zA-Z0-9_]{3,30}$/.test(input.name)) {
    throw new DevaError({ message: "name must be 3-30 chars of letters, digits, or underscore (no .agent/.genie suffix)." });
  }
  if (typeof input.description !== "string" || input.description.trim().length < 10 || input.description.length > 500) {
    throw new DevaError({ message: "description is required and must be 10-500 characters." });
  }
  if (typeof input.client_id !== "string" || !CLIENT_ID_PATTERN.test(input.client_id)) {
    throw new DevaError({
      message: "client_id is required: 32-128 chars of [A-Za-z0-9_-]. Generate one once with `openssl rand -hex 32` and keep it secret."
    });
  }
  if (input.force !== undefined && typeof input.force !== "boolean") {
    throw new DevaError({ message: "force must be a boolean." });
  }
}

/** Response of `POST /v1/agents/register` (201 new, 200 recovered retry). */
export interface RegisterAgentOutput {
  success?: boolean;
  agent: {
    id?: string;
    name?: string;
    api_key?: string;
    claim_url?: string;
    verification_code?: string;
    profile_url?: string;
    [key: string]: unknown;
  };
  important?: string;
  recoverable?: boolean;
  next?: Record<string, string> | null;
  [key: string]: unknown;
}

export class AuthManager {
  // Serializes register calls in this process so overlapping calls cannot revoke each
  // other's keys or persist an older key over a newer one.
  private registerQueue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly config: RuntimeConfig,
    private readonly client: DevaClient
  ) {}

  getApiKey(): string | undefined {
    return this.config.apiKey;
  }

  requireApiKey(): string {
    const key = this.getApiKey();
    if (!key) {
      throw new DevaError({
        message: "No API key configured. Run deva_agent_register or set DEVA_API_KEY."
      });
    }

    return key;
  }

  registerAgent(input: RegisterAgentInput): Promise<RegisterAgentOutput> {
    const run = this.registerQueue.then(() => this.registerAgentLocked(input));
    this.registerQueue = run.catch(() => undefined);
    return run;
  }

  /**
   * True unless the API rejects the configured key with 401. A 403 means the key
   * authenticates but is not allowed this call, so it still counts as working.
   */
  private async hasWorkingApiKey(): Promise<boolean> {
    if (!this.getApiKey()) {
      return false;
    }
    try {
      await this.client.request({ method: "GET", path: "/v1/agents/status" });
      return true;
    } catch (error) {
      if (error instanceof DevaError && error.status === 401) {
        return false;
      }
      if (error instanceof DevaError && error.status === 403) {
        return true;
      }
      throw error;
    }
  }

  private async registerAgentLocked(input: RegisterAgentInput): Promise<RegisterAgentOutput> {
    validateRegisterInput(input);
    if (!input.force && (await this.hasWorkingApiKey())) {
      throw new DevaError({
        message:
          "Already registered: the configured API key works. Registering again revokes it; pass force: true to rotate the key anyway."
      });
    }

    const result = await this.client.request<RegisterAgentOutput>({
      method: "POST",
      path: "/v1/agents/register",
      body: { name: input.name, description: input.description, client_id: input.client_id },
      requiresAuth: false
    });

    // The key is nested: { agent: { api_key, claim_url, ... } }.
    const apiKey = result.agent?.api_key;
    if (!apiKey) {
      throw new DevaError({ message: "Registration succeeded but no api_key returned." });
    }

    try {
      await saveApiKey(this.config, apiKey, result.agent?.name ?? input.name);
    } catch (error) {
      // Never echo the key. The caller recovers it by re-running register with the same
      // name + client_id once the config path is writable.
      throw new DevaError({
        code: "CONFIG_SAVE_FAILED",
        message: `Registered, but the API key could not be saved to ${this.config.configPath} (${
          error instanceof Error ? error.message : String(error)
        }). Fix the config path, then re-run deva_agent_register with the same name and client_id to recover a new key.`
      });
    }
    this.config.apiKey = apiKey;

    return result;
  }
}
