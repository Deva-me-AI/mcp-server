import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { AuthManager } from "../src/auth.js";
import { RuntimeConfig } from "../src/config.js";
import { DevaClient } from "../src/deva-client.js";
import { DevaError } from "../src/errors.js";
import { buildDefaultToolPolicyConfig } from "../src/tool-policy.js";

async function makeConfig(): Promise<RuntimeConfig> {
  const toolPolicy = buildDefaultToolPolicyConfig();
  const dir = await mkdtemp(path.join(os.tmpdir(), "deva-mcp-auth-"));
  return {
    apiBase: "https://api.deva.me",
    profile: "default",
    apiKey: undefined,
    timeoutMs: 50,
    logLevel: "error",
    configPath: path.join(dir, "config.json"),
    configFile: {
      profile: "default",
      api_base: "https://api.deva.me",
      agents: {},
      defaults: { timeout_ms: 50 },
      tool_policy: toolPolicy
    },
    toolPolicy
  };
}

// Shape returned by content-server POST /v1/agents/register (AgentRegisterResponse).
const registerResponse = {
  success: true,
  agent: {
    id: "a1",
    name: "smoke_test.agent",
    api_key: "deva_nested_key",
    claim_url: "https://deva.me/claim/x",
    verification_code: "ABC-123",
    profile_url: "https://deva.me/a/smoke_test.agent"
  },
  important: "save it",
  recoverable: true,
  next: { discover_url: "/v1/agents/resources/discover", claim_url: "https://deva.me/claim/x", hint: "h" }
};

describe("AuthManager.registerAgent", () => {
  it("POSTs /v1/agents/register with client_id and persists the nested agent.api_key", async () => {
    const config = await makeConfig();
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify(registerResponse), { status: 201 })
    );
    const client = new DevaClient(config, () => config.apiKey, { fetch: fetchMock });
    const auth = new AuthManager(config, client);

    const clientId = "550e8400-e29b-41d4-a716-446655440000";
    await auth.registerAgent({ name: "smoke_test", description: "a ten-plus char description", client_id: clientId });

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://api.deva.me/v1/agents/register");
    expect(JSON.parse(String(init?.body))).toEqual({
      name: "smoke_test",
      description: "a ten-plus char description",
      client_id: clientId
    });
    expect(config.apiKey).toBe("deva_nested_key");
    const saved = JSON.parse(await readFile(config.configPath, "utf8"));
    expect(saved.agents.default.api_key).toBe("deva_nested_key");
  });

  it("throws when the response carries no agent.api_key", async () => {
    const config = await makeConfig();
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ success: true, agent: { id: "a1", name: "x" } }), { status: 201 })
    );
    const auth = new AuthManager(config, new DevaClient(config, () => undefined, { fetch: fetchMock }));
    await expect(auth.registerAgent({ name: "smoke_test", description: "a ten-plus char description" })).rejects.toThrow(
      /no api_key returned/
    );
  });

  it("generates a client_id, persists it BEFORE the request, and reuses it to recover a lost key", async () => {
    const config = await makeConfig();
    const bodies: Array<Record<string, unknown>> = [];
    let savedBeforeFirstRequest: string | undefined;
    const replies = [
      { status: 201, key: "deva_first_key", fail: true },
      { status: 200, key: "deva_recovered_key", fail: false }
    ];
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)));
      if (bodies.length === 1) {
        savedBeforeFirstRequest = JSON.parse(await readFile(config.configPath, "utf8")).agents.default.client_id;
      }
      const reply = replies.shift()!;
      // Response lost after the server registered (non-retryable, surfaces to the caller).
      if (reply.fail) throw new DevaError({ message: "connection reset" });
      return new Response(
        JSON.stringify({ ...registerResponse, agent: { ...registerResponse.agent, api_key: reply.key } }),
        { status: reply.status }
      );
    });
    const client = new DevaClient(config, () => config.apiKey, { fetch: fetchMock as never });
    const auth = new AuthManager(config, client);
    const input = { name: "smoke_test", description: "a ten-plus char description" };

    await expect(auth.registerAgent(input)).rejects.toThrow();
    const clientId = bodies[0].client_id as string;
    expect(clientId).toMatch(/^[A-Za-z0-9_-]{32,128}$/);
    expect(savedBeforeFirstRequest).toBe(clientId);

    await auth.registerAgent(input);
    expect(bodies.at(-1)!.client_id).toBe(clientId);
    expect(config.apiKey).toBe("deva_recovered_key");
    const saved = JSON.parse(await readFile(config.configPath, "utf8"));
    expect(saved.agents.default.api_key).toBe("deva_recovered_key");
    expect(saved.agents.default.client_id).toBe(clientId);
  });

  it("rejects missing/short description and malformed client_id without calling the API", async () => {
    const config = await makeConfig();
    const fetchMock = vi.fn();
    const auth = new AuthManager(config, new DevaClient(config, () => undefined, { fetch: fetchMock as never }));
    await expect(auth.registerAgent({ name: "smoke_test" } as never)).rejects.toThrow(/description is required/);
    await expect(auth.registerAgent({ name: "smoke_test", description: "short" })).rejects.toThrow(/description/);
    await expect(
      auth.registerAgent({ name: "smoke_test", description: "a ten-plus char description", client_id: "too-short" })
    ).rejects.toThrow(/client_id/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
