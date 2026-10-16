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
}

const CLIENT_ID_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;

/** Validates register input locally so bad values fail fast instead of as an API 422. */
export function validateRegisterInput(input: { name?: unknown; description?: unknown; client_id?: unknown }): void {
  if (typeof input.name !== "string" || !/^[a-zA-Z0-9_]{3,30}$/.test(input.name)) {
    throw new DevaError({ message: "name must be 3-30 chars of letters, digits, or underscore (no .agent/.genie suffix)." });
  }
  if (typeof input.description !== "string" || input.description.trim().length < 10 || input.description.length > 500) {
    throw new DevaError({ message: "description is required and must be 10-500 characters." });
  }
  if (input.client_id !== undefined && (typeof input.client_id !== "string" || !CLIENT_ID_PATTERN.test(input.client_id))) {
    throw new DevaError({ message: "client_id must be 32-128 chars of [A-Za-z0-9_-] (e.g. a uuid4)." });
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

  async registerAgent(input: RegisterAgentInput): Promise<RegisterAgentOutput> {
    validateRegisterInput(input);
    // Always send a client_id, persisted before the request: if the response is lost, a
    // retry with the same name reuses the stored id and recovers the unclaimed agent.
    const clientId = await ensureClientId(this.config, input.client_id);
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

    await saveApiKey(this.config, apiKey, result.agent?.name ?? input.name);
    this.config.apiKey = apiKey;

    return result;
  }
}
