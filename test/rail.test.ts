import { mkdtemp, readFile, readdir, rm, stat, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DevaClient } from "../src/deva-client.js";
import { RuntimeConfig } from "../src/config.js";
import { DevaMcpServer } from "../src/server.js";
import { buildDefaultToolPolicyConfig, normalizeToolPolicyConfig, getToolSecurityMetadata, ToolPolicyEnforcer } from "../src/tool-policy.js";
import { createRailTools } from "../src/tools/rail.js";

type CallHandler = (request: { method: string; params: { name: string; arguments: Record<string, unknown> } }) => Promise<{ isError?: boolean; content: { text: string }[] }>;

const config = { apiBase: "https://api.deva.test", timeoutMs: 1000 } as RuntimeConfig;
const directories: string[] = [];
afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true })));
});
async function destination() {
  const dir = await mkdtemp(join(tmpdir(), "deva-rail-test-"));
  directories.push(dir);
  return join(dir, "output.json");
}
function harness(payload: unknown = {}, status = 200, key: string | undefined = "test-key") {
  const fetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify(payload), { status }));
  const client = new DevaClient(config, () => key, { fetch });
  const call = (name: string, args: Record<string, unknown>, maxRunCredits?: number) =>
    createRailTools().find(tool => tool.name === name)!.execute(args, { client, auth: {} as never, maxRunCredits });
  return { fetch, call };
}

describe("generic tool rail", () => {
  it.each([new Error("network failure"), Object.assign(new Error("timeout"), { name: "AbortError" })])("retains the run ceiling after an ambiguous failure: %s", async error => {
    const toolPolicy = { ...buildDefaultToolPolicyConfig(), spend_caps: { session_karma: 100, default_tool_karma: 100, per_tool_karma: {} } };
    const fetch = vi.fn().mockRejectedValue(error);
    vi.stubGlobal("fetch", fetch);
    const server = new DevaMcpServer({ ...config, apiKey: "test", toolPolicy });
    const internals = server as unknown as { mcpServer: { _requestHandlers: Map<string, CallHandler> }; toolPolicy: ToolPolicyEnforcer };
    const call = internals.mcpServer._requestHandlers.get("tools/call")!;
    const request = { method: "tools/call", params: { name: "deva_tools_run", arguments: { slug: "x", maxTotalChargeUsd: 0.1 } } };
    expect((await call(request)).isError).toBe(true);
    expect(internals.toolPolicy.getSessionKarmaSpent()).toBe(100);
    expect(internals.toolPolicy.getSessionKarmaPending()).toBe(0);
    expect((await call(request)).isError).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("releases a run reservation when output validation fails before submission", async () => {
    const toolPolicy = { ...buildDefaultToolPolicyConfig(), spend_caps: { session_karma: 100, default_tool_karma: 100, per_tool_karma: {} } };
    const fetch = vi.fn(async () => new Response(JSON.stringify({ run_id: "r1", status: "running" })));
    vi.stubGlobal("fetch", fetch);
    const server = new DevaMcpServer({ ...config, apiKey: "test", toolPolicy });
    const internals = server as unknown as { mcpServer: { _requestHandlers: Map<string, CallHandler> }; toolPolicy: ToolPolicyEnforcer };
    const call = internals.mcpServer._requestHandlers.get("tools/call")!;
    const args = { slug: "x", maxTotalChargeUsd: 0.1 };
    const failed = await call({ method: "tools/call", params: { name: "deva_tools_run", arguments: { ...args, output_file: "" } } });
    expect(failed.isError).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
    expect(internals.toolPolicy.getSessionKarmaSpent()).toBe(0);
    expect(internals.toolPolicy.getSessionKarmaPending()).toBe(0);
    expect((await call({ method: "tools/call", params: { name: "deva_tools_run", arguments: args } })).isError).not.toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("requires destructive-tool authorization for file-capable polling", async () => {
    for (const name of ["deva_tools_run", "deva_tools_get_run"]) {
      expect(getToolSecurityMetadata(name).destructive).toBe(true);
    }
    const output_file = await destination();
    await writeFile(output_file, "keep me");
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const server = new DevaMcpServer({ ...config, apiKey: "test", toolPolicy: normalizeToolPolicyConfig({ enabled_tools: [] }) });
    const internals = server as unknown as { mcpServer: { _requestHandlers: Map<string, CallHandler> } };
    const response = await internals.mcpServer._requestHandlers.get("tools/call")!({ method: "tools/call", params: { name: "deva_tools_get_run", arguments: { run_id: "r1", output_file } } });
    expect(response.isError).toBe(true);
    expect(await readFile(output_file, "utf8")).toBe("keep me");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not follow a staging symlink substituted while awaiting the response", async () => {
    const output_file = await destination();
    const victim = join(dirname(output_file), "victim");
    await writeFile(victim, "keep me");
    const { fetch, call } = harness();
    let privateMode: number | undefined;
    fetch.mockImplementation(async () => {
      const entries = await readdir(dirname(output_file));
      const staging = entries.find(name => name !== "victim")!;
      let temporary = join(dirname(output_file), staging);
      if ((await stat(temporary)).isDirectory()) {
        privateMode = (await stat(temporary)).mode & 0o777;
        temporary = join(temporary, (await readdir(temporary))[0]);
      }
      await unlink(temporary);
      await symlink(victim, temporary);
      return new Response(JSON.stringify({ run_id: "r1", status: "succeeded", output: "private output" }));
    });
    expect(await call("deva_tools_get_run", { run_id: "r1", output_file })).toMatchObject({
      run_id: "r1", output_file_error: expect.stringContaining("do not rerun")
    });
    expect(await readFile(victim, "utf8")).toBe("keep me");
    expect(privateMode).toBe(0o700);
    expect(await readdir(dirname(output_file))).toEqual(["victim"]);
  });

  it("documents every registered tool exactly once in the inventory", async () => {
    const server = new DevaMcpServer({ ...config, toolPolicy: buildDefaultToolPolicyConfig() });
    const tools = (server as unknown as { tools: { name: string }[] }).tools;
    const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");
    expect(readme).toContain(`## Tool Inventory (${tools.length})`);
    const inventory = readme.split("## Tool Inventory")[1];
    const names = [...inventory.matchAll(/^- `(deva_\w+)`/gm)].map(match => match[1]);
    expect(names.sort()).toEqual(tools.map(tool => tool.name).sort());
  });

  it("discovers without auth and preserves pagination and generic provider filters", async () => {
    const payload = { items: [{ slug: "future/tool" }], total: 2, next_cursor: "next" };
    const { fetch, call } = harness(payload, 200, undefined);
    expect(await call("deva_tools_discover", { q: "a & b", provider: "future", cursor: "a+b", limit: 2 })).toEqual(payload);
    const url = new URL(String(fetch.mock.calls[0][0]));
    expect(url.pathname).toBe("/v1/agents/resources/discover");
    expect(Object.fromEntries(url.searchParams)).toEqual({ q: "a & b", provider: "future", cursor: "a+b", limit: "2" });
    expect(fetch.mock.calls[0][1]?.headers).not.toHaveProperty("authorization");
  });

  it("encodes inspect slugs and sends the exact estimate contract", async () => {
    const { fetch, call } = harness({}, 200, undefined);
    await call("deva_tools_inspect", { slug: "future/tool?x#y" });
    expect(fetch.mock.calls[0][0]).toBe("https://api.deva.test/v1/agents/resources/inspect/future%2Ftool%3Fx%23y");
    await call("deva_tools_estimate", { slug: "future/tool", params: { query: "hello" }, maxTotalChargeUsd: 0.5 });
    expect(fetch.mock.calls[1][0]).toBe("https://api.deva.test/v1/agents/resources/estimate");
    expect(JSON.parse(String(fetch.mock.calls[1][1]?.body))).toEqual({ slug: "future/tool", params: { query: "hello" }, maxTotalChargeUsd: 0.5 });
  });

  it("returns async run handles and clamps the upstream charge to the local budget", async () => {
    const { fetch, call } = harness({ run_id: "r1", status: "running", poll: "/runs/r1" }, 202);
    const response = await call("deva_tools_run", { slug: "future/tool", params: { maxTotalChargeUsd: 999 }, maxTotalChargeUsd: 20 }, 0.5);
    expect(response).toMatchObject({ run_id: "r1", status: "running", next_action: expect.stringContaining("deva_tools_get_run") });
    expect(fetch.mock.calls[0][0]).toBe("https://api.deva.test/v1/agents/resources/run/future%2Ftool");
    expect(JSON.parse(String(fetch.mock.calls[0][1]?.body)).maxTotalChargeUsd).toBe(0.5);
    expect(fetch.mock.calls[0][1]?.headers).toMatchObject({ authorization: "Bearer test-key" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([429, 500, 502, 503])("never retries a paid run after HTTP %s", async status => {
    const { fetch, call } = harness({ message: "failed" }, status);
    await expect(call("deva_tools_run", { slug: "future/tool" })).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([new Error("network failure"), Object.assign(new Error("timeout"), { name: "AbortError" })])("never retries network failures or timeouts", async error => {
    const { fetch, call } = harness();
    fetch.mockRejectedValue(error);
    await expect(call("deva_tools_run", { slug: "future/tool" })).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each(["deva_tools_run", "deva_tools_get_run"])("writes complete output and returns a bounded summary for %s", async name => {
    const output_file = await destination();
    const payload = { run_id: "r1", status: "succeeded", credits_charged: "0.02", items: ["x".repeat(100_000)], output: { nested: "full output" } };
    const { fetch, call } = harness(payload);
    const response = await call(name, { slug: "future/tool", run_id: "r1", output_file });
    expect(JSON.parse(await readFile(output_file, "utf8"))).toEqual(payload);
    expect(JSON.stringify(response).length).toBeLessThan(600);
    expect(response).toMatchObject({ run_id: "r1", status: "succeeded", output_file, result_count: 1 });
    expect(response).not.toHaveProperty("next_action");
    expect((await stat(output_file)).mode & 0o777).toBe(0o600);
    expect(String(fetch.mock.calls[0][1]?.body)).not.toContain("output_file");
    // Polls can atomically replace the same file.
    await call(name, { slug: "future/tool", run_id: "r1", output_file });
  });

  it("returns synchronous output inline and polls encoded run IDs", async () => {
    const payload = { run_id: "r1", status: "succeeded", output: { text: "answer" }, credits_charged: 0 };
    const { fetch, call } = harness(payload);
    expect(await call("deva_tools_run", { slug: "future/tool" })).toEqual(payload);
    expect(await call("deva_tools_get_run", { run_id: "a/b?c" })).toEqual(payload);
    expect(fetch.mock.calls[1][0]).toBe("https://api.deva.test/v1/agents/resources/runs/a%2Fb%3Fc");
  });

  it("rejects invalid input and an unwritable destination before submitting a run", async () => {
    const { fetch, call } = harness();
    for (const args of [{}, { slug: "x", params: [] }, { slug: "x", maxTotalChargeUsd: -1 }, { slug: "x", output_file: "" }]) {
      await expect(call("deva_tools_run", args)).rejects.toThrow();
    }
    const path = await destination();
    await expect(call("deva_tools_run", { slug: "x", output_file: join(path, "missing", "out") })).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps the run handle if saving fails after the HTTP response", async () => {
    const path = await destination();
    const output_file = join(path, ".."); // existing directory: staging succeeds, rename fails
    const { call } = harness({ run_id: "r1", status: "running" }, 202);
    expect(await call("deva_tools_run", { slug: "x", output_file })).toMatchObject({ run_id: "r1", output_file_error: expect.stringContaining("do not rerun") });
  });

  it("enables all five tools by default while retaining paid spend caps and explicit opt-out", () => {
    const policy = new ToolPolicyEnforcer(buildDefaultToolPolicyConfig());
    for (const tool of createRailTools()) expect(policy.canList(tool.name)).toBe(true);
    expect(() => policy.assertCanExecute("deva_tools_run")).toThrow(/session_karma/);
    expect(new ToolPolicyEnforcer(normalizeToolPolicyConfig({ enabled_tools: [] })).canList("deva_tools_run")).toBe(false);
    expect(normalizeToolPolicyConfig({}).enabled_tools).toContain("deva_tools_run");
  });

  it.each([true, false])("reserves only the requested run cost (explicit cap: %s)", async explicit => {
    const toolPolicy = { ...buildDefaultToolPolicyConfig(), spend_caps: { session_karma: 500, default_tool_karma: 500, per_tool_karma: {} } };
    const fetch = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify(
      String(input).endsWith("/estimate") ? { amount_credits: 0.1, deterministic: false } : { run_id: "r1", status: "running" }
    ), { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    const server = new DevaMcpServer({ ...config, apiKey: "test", toolPolicy });
    const internals = server as unknown as { mcpServer: { _requestHandlers: Map<string, CallHandler> }; toolPolicy: ToolPolicyEnforcer };
    const call = internals.mcpServer._requestHandlers.get("tools/call")!;
    const args = { slug: "future/tool", ...(explicit ? { maxTotalChargeUsd: 0.1 } : {}) };
    for (let i = 0; i < 2; i++) {
      const response = await call({ method: "tools/call", params: { name: "deva_tools_run", arguments: args } });
      expect(response.isError).not.toBe(true);
      expect(internals.toolPolicy.getSessionKarmaSpent()).toBe((i + 1) * 100);
    }
    const runs = fetch.mock.calls.filter(([url]) => String(url).includes("/run/"));
    expect(runs).toHaveLength(2);
    for (const [, init] of runs) expect(JSON.parse(String(init?.body)).maxTotalChargeUsd).toBe(0.1);
  });

  it.each([{}, { amount_credits: -1 }, { amount_credits: "0.1" }, { amount_credits: 0 }, { amount_credits: 1e10 }])("rejects an invalid estimate before starting a paid run: %j", async estimate => {
    const toolPolicy = { ...buildDefaultToolPolicyConfig(), spend_caps: { session_karma: 500, default_tool_karma: 500, per_tool_karma: {} } };
    const fetch = vi.fn(async () => new Response(JSON.stringify(estimate)));
    vi.stubGlobal("fetch", fetch);
    const server = new DevaMcpServer({ ...config, apiKey: "test", toolPolicy });
    const internals = server as unknown as { mcpServer: { _requestHandlers: Map<string, CallHandler> }; toolPolicy: ToolPolicyEnforcer };
    const call = internals.mcpServer._requestHandlers.get("tools/call")!;
    const response = await call({ method: "tools/call", params: { name: "deva_tools_run", arguments: { slug: "future/tool" } } });
    expect(response.isError).toBe(true);
    expect(response.content[0].text).toContain("provide maxTotalChargeUsd");
    expect(fetch).toHaveBeenCalledExactlyOnceWith("https://api.deva.test/v1/agents/resources/estimate", expect.anything());
    expect(internals.toolPolicy.getSessionKarmaPending()).toBe(0);
    expect(internals.toolPolicy.getSessionKarmaSpent()).toBe(0);
  });

  it("returns async handles through the MCP boundary and accounts for their reserved ceiling", async () => {
    const toolPolicy = { ...buildDefaultToolPolicyConfig(), spend_caps: { session_karma: 500, default_tool_karma: 500, per_tool_karma: {} } };
    const fetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ run_id: "r1", status: "running" }), { status: 202 }));
    vi.stubGlobal("fetch", fetch);
    const server = new DevaMcpServer({ ...config, apiKey: "test", toolPolicy });
    const internals = server as unknown as { mcpServer: { _requestHandlers: Map<string, CallHandler> }; toolPolicy: ToolPolicyEnforcer };
    const call = internals.mcpServer._requestHandlers.get("tools/call")!;
    const response = await call({ method: "tools/call", params: { name: "deva_tools_run", arguments: { slug: "future/tool", maxTotalChargeUsd: 0.5 } } });
    expect(response.isError).not.toBe(true);
    expect(JSON.parse(response.content[0].text)).toMatchObject({ run_id: "r1", next_action: expect.stringContaining("deva_tools_get_run") });
    expect(internals.toolPolicy.getSessionKarmaSpent()).toBe(500);
    expect(JSON.parse(String(fetch.mock.calls[0][1]?.body)).maxTotalChargeUsd).toBe(0.5);
    const poll = await call({ method: "tools/call", params: { name: "deva_tools_get_run", arguments: { run_id: "r1" } } });
    expect(poll.isError).not.toBe(true);
    expect(internals.toolPolicy.getSessionKarmaSpent()).toBe(500);
  });
});

it.skipIf(!process.env.DEVA_API_KEY)("live rail smoke: discover, inspect, estimate and existing balance (no paid run)", async () => {
  const client = new DevaClient({ ...config, apiBase: "https://api.deva.me", timeoutMs: 20_000 }, () => process.env.DEVA_API_KEY);
  const context = { client, auth: {} as never };
  const tools = createRailTools();
  const page = await tools[0].execute({ limit: 1 }, context) as { items: { slug: string }[]; total: number };
  expect(page.total).toBeGreaterThan(0);
  const slug = page.items[0].slug;
  expect(await tools[1].execute({ slug }, context)).toHaveProperty("input_schema");
  expect(await tools[2].execute({ slug, params: {} }, context)).toHaveProperty("deterministic");
  const { createBalanceTools } = await import("../src/tools/balance.js");
  expect(await createBalanceTools()[0].execute({}, context)).toBeTruthy();
}, 60_000);
