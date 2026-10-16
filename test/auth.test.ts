import { chmod, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { AuthManager } from "../src/auth.js";
import { RuntimeConfig } from "../src/config.js";
import { DevaClient } from "../src/deva-client.js";
import { DevaError } from "../src/errors.js";
import { buildDefaultToolPolicyConfig } from "../src/tool-policy.js";
import { createAgentTools } from "../src/tools/agent.js";

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

// Shape returned by POST /v1/agents/register.
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

const CLIENT_ID = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const baseInput = { name: "smoke_test", description: "a ten-plus char description", client_id: CLIENT_ID };

function withKey(key: string) {
  return { ...registerResponse, agent: { ...registerResponse.agent, api_key: key } };
}

describe("AuthManager.registerAgent", () => {
  it("POSTs /v1/agents/register with the caller's client_id and persists the nested agent.api_key", async () => {
    const config = await makeConfig();
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify(registerResponse), { status: 201 })
    );
    const auth = new AuthManager(config, new DevaClient(config, () => config.apiKey, { fetch: fetchMock }));

    await auth.registerAgent(baseInput);

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://api.deva.me/v1/agents/register");
    expect(JSON.parse(String(init?.body))).toEqual(baseInput);
    expect(config.apiKey).toBe("deva_nested_key");
    const saved = JSON.parse(await readFile(config.configPath, "utf8"));
    expect(saved.agents.default.api_key).toBe("deva_nested_key");
    // The client_id belongs to the caller and is never written to the config file.
    expect(JSON.stringify(saved)).not.toContain(CLIENT_ID);
  });

  it("throws when the response carries no agent.api_key", async () => {
    const config = await makeConfig();
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ success: true, agent: { id: "a1", name: "x" } }), { status: 201 })
    );
    const auth = new AuthManager(config, new DevaClient(config, () => undefined, { fetch: fetchMock }));
    await expect(auth.registerAgent(baseInput)).rejects.toThrow(/no api_key returned/);
  });

  it("recovers a lost key by re-running register with the same client_id", async () => {
    const config = await makeConfig();
    const bodies: Array<Record<string, unknown>> = [];
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)));
      // First response is lost after the server registered.
      if (bodies.length === 1) throw new DevaError({ message: "connection reset" });
      return new Response(JSON.stringify(withKey("deva_recovered_key")), { status: 200 });
    });
    const auth = new AuthManager(config, new DevaClient(config, () => config.apiKey, { fetch: fetchMock as never }));

    await expect(auth.registerAgent(baseInput)).rejects.toThrow();
    await auth.registerAgent(baseInput);
    expect(bodies.map((b) => b.client_id)).toEqual([CLIENT_ID, CLIENT_ID]);
    expect(config.apiKey).toBe("deva_recovered_key");
  });

  it("requires a well-formed client_id, name and description without calling the API", async () => {
    const config = await makeConfig();
    const fetchMock = vi.fn();
    const auth = new AuthManager(config, new DevaClient(config, () => undefined, { fetch: fetchMock as never }));
    const { client_id: _omit, ...noClientId } = baseInput;
    await expect(auth.registerAgent(noClientId as never)).rejects.toThrow(/client_id is required.*openssl rand -hex 32/);
    await expect(auth.registerAgent({ ...baseInput, client_id: "too-short" })).rejects.toThrow(/client_id/);
    await expect(auth.registerAgent({ ...baseInput, client_id: "x".repeat(32) + "!" })).rejects.toThrow(/client_id/);
    await expect(auth.registerAgent({ ...baseInput, description: "short" })).rejects.toThrow(/description/);
    await expect(auth.registerAgent({ ...baseInput, name: "bad.agent" })).rejects.toThrow(/name/);
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

    await expect(auth.registerAgent(baseInput)).rejects.toThrow(/Already registered.*force: true/);
    expect(calls.some((u) => u.endsWith("/v1/agents/register"))).toBe(false);
    expect(config.apiKey).toBe("deva_existing_key");

    await auth.registerAgent({ ...baseInput, force: true });
    expect(calls.filter((u) => u.endsWith("/v1/agents/register"))).toHaveLength(1);
    expect(config.apiKey).toBe("deva_nested_key");
  });

  it("registers when the stored key is rejected with 401", async () => {
    const config = await makeConfig();
    config.apiKey = "deva_revoked_key";
    const fetchMock = vi.fn(async (input: RequestInfo | URL) =>
      String(input).endsWith("/v1/agents/status")
        ? new Response(JSON.stringify({ message: "invalid key" }), { status: 401 })
        : new Response(JSON.stringify(registerResponse), { status: 200 })
    );
    const auth = new AuthManager(config, new DevaClient(config, () => config.apiKey, { fetch: fetchMock as never }));
    await auth.registerAgent(baseInput);
    expect(config.apiKey).toBe("deva_nested_key");
  });

  it("treats 403 from /v1/agents/status as a working key and refuses without force", async () => {
    const config = await makeConfig();
    config.apiKey = "deva_forbidden_key";
    const calls: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return String(input).endsWith("/v1/agents/status")
        ? new Response(JSON.stringify({ message: "forbidden" }), { status: 403 })
        : new Response(JSON.stringify(registerResponse), { status: 200 });
    });
    const auth = new AuthManager(config, new DevaClient(config, () => config.apiKey, { fetch: fetchMock as never }));
    await expect(auth.registerAgent(baseInput)).rejects.toThrow(/Already registered/);
    expect(calls.some((u) => u.endsWith("/v1/agents/register"))).toBe(false);
    expect(config.apiKey).toBe("deva_forbidden_key");
  });

  it("reports a failed key save without printing the key and keeps no pending state", async () => {
    const config = await makeConfig();
    // Point the config below a regular file so mkdir fails with ENOTDIR.
    const blocker = path.join(path.dirname(config.configPath), "blocker");
    await writeFile(blocker, "x");
    const realPath = config.configPath;
    config.configPath = path.join(blocker, "config.json");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(withKey("deva_secret_key_value")), { status: 201 }));
    const auth = new AuthManager(config, new DevaClient(config, () => config.apiKey, { fetch: fetchMock as never }));

    const error = await auth.registerAgent(baseInput).then(
      () => undefined,
      (e: unknown) => e as DevaError
    );
    expect(error).toBeInstanceOf(DevaError);
    expect(error!.code).toBe("CONFIG_SAVE_FAILED");
    expect(error!.message).toMatch(/could not be saved/);
    expect(error!.message).toMatch(/re-run deva_agent_register with the same name and client_id/);
    expect(error!.message).not.toContain("deva_secret_key_value");
    expect(config.apiKey).toBeUndefined();
    expect(config.configFile.agents.default?.api_key).toBeUndefined();

    // Once the path is writable, re-running with the same client_id recovers a key.
    config.configPath = realPath;
    fetchMock.mockImplementationOnce(async () => new Response(JSON.stringify(withKey("deva_recovered_key")), { status: 200 }));
    await auth.registerAgent(baseInput);
    const saved = JSON.parse(await readFile(realPath, "utf8"));
    expect(saved.agents.default.api_key).toBe("deva_recovered_key");
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
      // The first response is slowest: without the lock it would land (and be saved) last.
      await new Promise((r) => setTimeout(r, n === 1 ? 30 : 1));
      inFlight -= 1;
      return new Response(JSON.stringify(withKey(key)), { status: 200 });
    });
    const auth = new AuthManager(config, new DevaClient(config, () => undefined, { fetch: fetchMock as never }));
    const input = { ...baseInput, force: true };

    const results = await Promise.all([auth.registerAgent(input), auth.registerAgent(input), auth.registerAgent(input)]);
    expect(maxInFlight).toBe(1);
    expect(results.map((r) => r.agent.api_key)).toEqual(["deva_key_1", "deva_key_2", "deva_key_3"]);
    const saved = JSON.parse(await readFile(config.configPath, "utf8"));
    expect(saved.agents.default.api_key).toBe("deva_key_3");
    expect(config.apiKey).toBe("deva_key_3");
  });

  it("writes the config with mode 0600 even if the file already existed with looser perms", async () => {
    const config = await makeConfig();
    await writeFile(config.configPath, "{}", { mode: 0o644 });
    await chmod(config.configPath, 0o644);
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(registerResponse), { status: 201 }));
    const auth = new AuthManager(config, new DevaClient(config, () => undefined, { fetch: fetchMock as never }));
    await auth.registerAgent(baseInput);
    expect((await stat(config.configPath)).mode & 0o777).toBe(0o600);
  });
});

describe("deva_agent_register tool", () => {
  it("declares client_id as required and validates before calling auth", async () => {
    const tool = createAgentTools().find((t) => t.name === "deva_agent_register")!;
    expect((tool.inputSchema as { required: string[] }).required).toEqual(["name", "description", "client_id"]);
    const registerAgent = vi.fn();
    const context = { client: {} as never, auth: { registerAgent } as never };
    await expect(tool.execute({ name: "smoke_test", description: "a ten-plus char description" }, context)).rejects.toThrow(
      /client_id is required/
    );
    expect(registerAgent).not.toHaveBeenCalled();
    await tool.execute(baseInput, context);
    expect(registerAgent).toHaveBeenCalledWith(baseInput);
  });
});
