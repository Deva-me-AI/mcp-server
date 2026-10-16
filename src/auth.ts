import { RuntimeConfig, ensureClientId, saveApiKey } from "./config.js";
import { DevaClient } from "./deva-client.js";
import { DevaError } from "./errors.js";

export interface RegisterAgentInput {
  /** 3-30 chars, `^[a-zA-Z0-9_]+$`, without the .agent/.genie suffix. */
  name: string;
  /** 10-500 chars. Required by `POST /v1/agents/register`. */
  description: string;
  /**
   * Stable random caller-generated id (32-128 chars, `[A-Za-z0-9_-]`, e.g. a uuid4).
   * Retrying register with the same name + client_id while unclaimed returns a fresh key.
   * Secret recovery credential: never log, commit, or share it. When omitted, the server
   * generates one and persists it in the config file (0600) before registering.
   */
  client_id?: string;
  /**
   * Register even though a working API key is already stored. A successful register retry
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
  if (input.client_id !== undefined && (typeof input.client_id !== "string" || !CLIENT_ID_PATTERN.test(input.client_id))) {
    throw new DevaError({ message: "client_id must be 32-128 chars of [A-Za-z0-9_-] (e.g. a uuid4)." });
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

  // Serializes register calls in this process: concurrent retries would each revoke the
  // previous key, and an older response could otherwise be persisted after a newer one.
  private registerQueue: Promise<unknown> = Promise.resolve();
  // A registered key whose save to disk failed; persisted before any further register call.
  private unsavedKey?: { apiKey: string; name: string };

  registerAgent(input: RegisterAgentInput): Promise<RegisterAgentOutput> {
    const run = this.registerQueue.then(() => this.registerAgentLocked(input));
    this.registerQueue = run.catch(() => undefined);
    return run;
  }

  /** True when the configured key authenticates; false when the API rejects it (401/403). */
  private async hasWorkingApiKey(): Promise<boolean> {
    if (!this.getApiKey()) {
      return false;
    }
    try {
      await this.client.request({ method: "GET", path: "/v1/agents/status" });
      return true;
    } catch (error) {
      if (error instanceof DevaError && (error.status === 401 || error.status === 403)) {
        return false;
      }
      throw error;
    }
  }

  private async registerAgentLocked(input: RegisterAgentInput): Promise<RegisterAgentOutput> {
    validateRegisterInput(input);
    if (this.unsavedKey) {
      await this.persistKey(this.unsavedKey.apiKey, this.unsavedKey.name);
    }
    if (!input.force && (await this.hasWorkingApiKey())) {
      throw new DevaError({
        message:
          "Already registered: the configured API key works. Registering again revokes it; pass force: true to rotate the key anyway."
      });
    }
    // Always send a client_id, persisted before the request: if the response is lost, a
    // retry with the same name reuses the stored id and recovers the unclaimed agent.
    const clientId = await ensureClientId(this.config, input.name, input.client_id);
    const result = await this.client.request<RegisterAgentOutput>({
      method: "POST",
      path: "/v1/agents/register",
      body: { name: input.name, description: input.description, client_id: clientId },
      requiresAuth: false
    });

    // The key is nested: { agent: { api_key, claim_url, ... } }.
    const apiKey = result.agent?.api_key;
    if (!apiKey) {
      throw new DevaError({ message: "Registration succeeded but no api_key returned." });
    }

    // Adopt the key in memory first so it is usable even if persisting fails.
    this.config.apiKey = apiKey;
    await this.persistKey(apiKey, result.agent?.name ?? input.name);

    return result;
  }

  /** Saves the key; on failure remembers it for the next call and surfaces the error. */
  private async persistKey(apiKey: string, name: string): Promise<void> {
    try {
      await saveApiKey(this.config, apiKey, name);
      this.unsavedKey = undefined;
    } catch (error) {
      this.unsavedKey = { apiKey, name };
      throw new DevaError({
        code: "CONFIG_SAVE_FAILED",
        message: `Registered, but saving the API key to ${this.config.configPath} failed (${
          error instanceof Error ? error.message : String(error)
        }). The key is active for this session only and will be saved on the next deva_agent_register call; to keep it now, store it yourself: ${apiKey}`
      });
    }
  }
}
