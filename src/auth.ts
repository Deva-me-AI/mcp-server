import { RuntimeConfig, saveApiKey } from "./config.js";
import { DevaClient } from "./deva-client.js";
import { DevaError } from "./errors.js";

export interface RegisterAgentInput {
  /** 3-30 chars, `^[a-zA-Z0-9_]+$`, without the .agent/.genie suffix. */
  name: string;
  /** 10-500 chars. Required by `POST /v1/agents/register`. */
  description?: string;
  /**
   * Stable random caller-generated id (32-128 chars, `[A-Za-z0-9_-]`, e.g. a uuid4).
   * Retrying register with the same name + client_id while unclaimed returns a fresh key.
   */
  client_id?: string;
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
    const result = await this.client.request<RegisterAgentOutput>({
      method: "POST",
      path: "/v1/agents/register",
      body: input,
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
