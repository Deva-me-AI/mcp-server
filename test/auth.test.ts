import { chmod, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
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
        savedBeforeFirstRequest = JSON.parse(await readFile(config.configPath, "utf8")).agents.default.client_ids.smoke_test;
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
    expect(saved.agents.default.client_ids.smoke_test).toBe(clientId);
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

  it("refuses to re-register while the stored key works, unless force is true", async () => {
    const config = await makeConfig();
    config.apiKey = "deva_existing_key";
    const calls: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      calls.push(String(input));
      if (String(input).endsWith("/v1/agents/status")) return new Response("{}", { status: 200 });
      return new Response(JSON.stringify(registerResponse), { status: 200 });
    });
    const auth = new AuthManager(config, new DevaClient(config, () => config.apiKey, { fetch: fetchMock as never }));
    const input = { name: "smoke_test", description: "a ten-plus char description" };

    await expect(auth.registerAgent(input)).rejects.toThrow(/Already registered.*force: true/);
    expect(calls.some((u) => u.endsWith("/v1/agents/register"))).toBe(false);
    expect(config.apiKey).toBe("deva_existing_key");

    await auth.registerAgent({ ...input, force: true });
    expect(calls.filter((u) => u.endsWith("/v1/agents/register"))).toHaveLength(1);
    expect(config.apiKey).toBe("deva_nested_key");
  });

  it("registers when the stored key is rejected (401)", async () => {
    const config = await makeConfig();
    config.apiKey = "deva_revoked_key";
    const fetchMock = vi.fn(async (input: RequestInfo | URL) =>
      String(input).endsWith("/v1/agents/status")
        ? new Response(JSON.stringify({ message: "invalid key" }), { status: 401 })
        : new Response(JSON.stringify(registerResponse), { status: 200 })
    );
    const auth = new AuthManager(config, new DevaClient(config, () => config.apiKey, { fetch: fetchMock as never }));
    await auth.registerAgent({ name: "smoke_test", description: "a ten-plus char description" });
    expect(config.apiKey).toBe("deva_nested_key");
  });

  it("surfaces a failed key save and persists the key on the next call", async () => {
    const config = await makeConfig();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) =>
      String(input).endsWith("/v1/agents/status")
        ? new Response("{}", { status: 200 })
        : new Response(JSON.stringify(registerResponse), { status: 201 })
    );
    const auth = new AuthManager(config, new DevaClient(config, () => config.apiKey, { fetch: fetchMock as never }));
    const input = { name: "smoke_test", description: "a ten-plus char description" };

    // The client_id is saved before the request; then point the config under a regular file
    // (mkdir fails with ENOTDIR) so the key save after the response fails.
    const realPath = config.configPath;
    fetchMock.mockImplementationOnce(async () => {
      config.configPath = path.join(realPath, "not-a-dir", "config.json");
      return new Response(JSON.stringify(registerResponse), { status: 201 });
    });
    await expect(auth.registerAgent(input)).rejects.toThrow(/saving the API key .* failed/);
    expect(config.apiKey).toBe("deva_nested_key");
    expect(config.configFile.agents.default.api_key).toBeUndefined();

    // Disk is writable again: the next call persists the pending key before anything else,
    // then refuses to rotate it because it works.
    config.configPath = realPath;
    await expect(auth.registerAgent(input)).rejects.toThrow(/Already registered/);
    const saved = JSON.parse(await readFile(realPath, "utf8"));
    expect(saved.agents.default.api_key).toBe("deva_nested_key");
  });

  it("serializes concurrent register calls and persists only the latest key", async () => {
    const config = await makeConfig();
    let inFlight = 0;
    let maxInFlight = 0;
    let n = 0;
    const fetchMock = vi.fn(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      const key = `deva_key_${++n}`;
      // The first response is slowest: without a lock it would land (and be saved) last.
      await new Promise((r) => setTimeout(r, n === 1 ? 30 : 1));
      inFlight -= 1;
      return new Response(JSON.stringify({ ...registerResponse, agent: { ...registerResponse.agent, api_key: key } }), {
        status: 200
      });
    });
    const auth = new AuthManager(config, new DevaClient(config, () => undefined, { fetch: fetchMock as never }));
    const input = { name: "smoke_test", description: "a ten-plus char description", force: true };

    const results = await Promise.all([auth.registerAgent(input), auth.registerAgent(input), auth.registerAgent(input)]);
    expect(maxInFlight).toBe(1);
    expect(results.map((r) => r.agent.api_key)).toEqual(["deva_key_1", "deva_key_2", "deva_key_3"]);
    const saved = JSON.parse(await readFile(config.configPath, "utf8"));
    expect(saved.agents.default.api_key).toBe("deva_key_3");
    expect(config.apiKey).toBe("deva_key_3");
  });

  it("keys client_ids by agent name and never clobbers another agent's id", async () => {
    const config = await makeConfig();
    const bodies: Array<Record<string, string>> = [];
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify(registerResponse), { status: 201 });
    });
    const auth = new AuthManager(config, new DevaClient(config, () => undefined, { fetch: fetchMock as never }));
    const supplied = "b".repeat(40);

    await auth.registerAgent({ name: "agent_one", description: "a ten-plus char description", force: true });
    await auth.registerAgent({ name: "agent_two", description: "a ten-plus char description", force: true });
    await auth.registerAgent({
      name: "agent_three",
      description: "a ten-plus char description",
      client_id: supplied,
      force: true
    });
    await auth.registerAgent({ name: "agent_one", description: "a ten-plus char description", force: true });

    expect(bodies[0].client_id).not.toBe(bodies[1].client_id);
    expect(bodies[2].client_id).toBe(supplied);
    expect(bodies[3].client_id).toBe(bodies[0].client_id);
    const saved = JSON.parse(await readFile(config.configPath, "utf8"));
    expect(saved.agents.default.client_ids).toEqual({
      agent_one: bodies[0].client_id,
      agent_two: bodies[1].client_id,
      agent_three: supplied
    });
  });

  it("writes the config with mode 0600 even if the file already existed with looser perms", async () => {
    const config = await makeConfig();
    await writeFile(config.configPath, "{}", { mode: 0o644 });
    await chmod(config.configPath, 0o644);
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(registerResponse), { status: 201 }));
    const auth = new AuthManager(config, new DevaClient(config, () => undefined, { fetch: fetchMock as never }));
    await auth.registerAgent({ name: "smoke_test", description: "a ten-plus char description" });
    expect((await stat(config.configPath)).mode & 0o777).toBe(0o600);
  });
});
