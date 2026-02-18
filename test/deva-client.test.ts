import { describe, expect, it, vi } from "vitest";
import { DevaClient } from "../src/deva-client.js";
import { RuntimeConfig } from "../src/config.js";
import { DevaError } from "../src/errors.js";

function makeConfig(): RuntimeConfig {
  return {
    apiBase: "https://api.deva.me",
    profile: "default",
    apiKey: "deva_test",
    timeoutMs: 50,
    logLevel: "error",
    configPath: "/tmp/deva-config.json",
    configFile: {
      profile: "default",
      api_base: "https://api.deva.me",
      agents: { default: { api_key: "deva_test" } },
      defaults: { timeout_ms: 50 }
    }
  };
}

describe("DevaClient", () => {
  it("injects auth header and parses json", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({ authorization: "Bearer deva_test" });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });

    const client = new DevaClient(makeConfig(), () => "deva_test", { fetch: fetchMock });
    const result = await client.request<{ ok: boolean }>({ method: "GET", path: "/agents/status" });

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries transient failures", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: "bad gateway" }), { status: 502 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    const client = new DevaClient(makeConfig(), () => "deva_test", { fetch: fetchMock });
    const result = await client.request<{ ok: boolean }>({ method: "GET", path: "/agents/status" });

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("parses x402 payment challenge from response body", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          code: "PAYMENT_REQUIRED",
          message: "Insufficient karma; pay with USDC",
          payment_challenge: {
            scheme: "x402",
            network: "base",
            amount: "0.01",
            pay_to: "0xabc123"
          }
        }),
        { status: 402 }
      );
    });

    const client = new DevaClient(makeConfig(), () => "deva_test", { fetch: fetchMock });

    await expect(client.request({ method: "POST", path: "/v1/agents/resources/search", body: { q: "mcp" } })).rejects.toMatchObject({
      name: "DevaError",
      status: 402,
      code: "PAYMENT_REQUIRED",
      paymentChallenge: {
        scheme: "x402",
        network: "base",
        amount: "0.01",
        pay_to: "0xabc123"
      }
    } satisfies Partial<DevaError>);
  });
});
