import { RuntimeConfig, saveApiKey } from "./config.js";
import { DevaClient } from "./deva-client.js";
import { DevaError } from "./errors.js";

export interface RegisterAgentInput {
  name: string;
  description?: string;
}

export interface RegisterAgentOutput {
  api_key: string;
  agent?: {
    name?: string;
    [key: string]: unknown;
  };
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
      path: "/agents/register",
      body: input,
      requiresAuth: false
    });

    if (!result.api_key) {
      throw new DevaError({ message: "Registration succeeded but no api_key returned." });
    }

    await saveApiKey(this.config, result.api_key, result.agent?.name ?? input.name);
    this.config.apiKey = result.api_key;

    return result;
  }
}
