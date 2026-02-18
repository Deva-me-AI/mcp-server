import { RuntimeConfig } from "./config.js";
import { DevaError, PaymentChallenge } from "./errors.js";

export interface RequestOptions {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  headers?: Record<string, string>;
  requiresAuth?: boolean;
  timeoutMs?: number;
}

export interface HttpClient {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

const RETRYABLE = new Set([429, 500, 502, 503]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toQueryString(query: RequestOptions["query"]): string {
  if (!query) {
    return "";
  }

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) {
      continue;
    }
    params.set(key, String(value));
  }

  const output = params.toString();
  return output.length > 0 ? `?${output}` : "";
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : undefined;
}

function extractPaymentChallenge(payload: unknown, response: Response): PaymentChallenge | undefined {
  const raw = asRecord(payload);
  const rawError = asRecord(raw?.error);
  const fromPayload = asRecord(
    rawError?.payment_challenge ??
      rawError?.paymentChallenge ??
      rawError?.challenge ??
      raw?.payment_challenge ??
      raw?.paymentChallenge ??
      raw?.challenge
  );

  const scheme =
    (typeof fromPayload?.scheme === "string" ? fromPayload.scheme : undefined) ??
    response.headers.get("x-payment-scheme") ??
    response.headers.get("payment-scheme") ??
    undefined;
  const network =
    (typeof fromPayload?.network === "string" ? fromPayload.network : undefined) ??
    response.headers.get("x-payment-network") ??
    response.headers.get("payment-network") ??
    undefined;
  const amount =
    (typeof fromPayload?.amount === "string" || typeof fromPayload?.amount === "number" ? fromPayload.amount : undefined) ??
    response.headers.get("x-payment-amount") ??
    response.headers.get("payment-amount") ??
    undefined;
  const payTo =
    (typeof fromPayload?.pay_to === "string" ? fromPayload.pay_to : undefined) ??
    (typeof fromPayload?.payTo === "string" ? fromPayload.payTo : undefined) ??
    response.headers.get("x-payment-pay-to") ??
    response.headers.get("x-payment-pay_to") ??
    response.headers.get("payment-pay-to") ??
    response.headers.get("payment-pay_to") ??
    undefined;

  if (scheme || network || amount !== undefined || payTo) {
    return {
      scheme,
      network,
      amount,
      pay_to: payTo
    };
  }

  return undefined;
}

async function parseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { raw: text };
  }
}

export class DevaClient {
  private readonly baseUrl: string;

  constructor(
    private readonly config: RuntimeConfig,
    private readonly getApiKey: () => string | undefined,
    private readonly httpClient: HttpClient = { fetch }
  ) {
    this.baseUrl = config.apiBase.replace(/\/$/, "");
  }

  async request<T>(options: RequestOptions): Promise<T> {
    const queryString = toQueryString(options.query);
    const url = `${this.baseUrl}${options.path}${queryString}`;

    let attempt = 0;
    let waitMs = 300;

    while (true) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? this.config.timeoutMs);

      try {
        const headers: Record<string, string> = {
          "content-type": "application/json",
          ...options.headers
        };

        if (options.requiresAuth !== false) {
          const apiKey = this.getApiKey();
          if (!apiKey) {
            throw new DevaError({ message: "No API key configured. Run deva_agent_register or set DEVA_API_KEY." });
          }
          headers["authorization"] = `Bearer ${apiKey}`;
        }

        const response = await this.httpClient.fetch(url, {
          method: options.method,
          headers,
          body: options.body === undefined ? undefined : JSON.stringify(options.body),
          signal: controller.signal
        });

        const payload = await parseBody(response);

        if (response.ok) {
          return payload as T;
        }

        const normalized = payload as {
          error?: {
            code?: string;
            message?: string;
            details?: unknown;
            balance?: number;
            required?: number;
            payment_challenge?: unknown;
            paymentChallenge?: unknown;
            challenge?: unknown;
          };
          code?: string;
          message?: string;
          details?: unknown;
          balance?: number;
          required?: number;
          payment_challenge?: unknown;
          paymentChallenge?: unknown;
          challenge?: unknown;
        };

        const code = normalized.error?.code ?? normalized.code;
        const message = normalized.error?.message ?? normalized.message ?? `HTTP ${response.status}`;
        const details = normalized.error?.details ?? normalized.details;
        const balance = normalized.error?.balance ?? normalized.balance;
        const required = normalized.error?.required ?? normalized.required;
        const paymentChallenge = response.status === 402 ? extractPaymentChallenge(payload, response) : undefined;

        const error = new DevaError({
          status: response.status,
          code,
          message,
          details,
          balance,
          required,
          paymentChallenge
        });

        if (RETRYABLE.has(response.status) && attempt < 3) {
          await sleep(waitMs);
          attempt += 1;
          waitMs *= 2;
          continue;
        }

        throw error;
      } catch (error) {
        const isAbort = error instanceof Error && error.name === "AbortError";

        if (isAbort && attempt < 3) {
          await sleep(waitMs);
          attempt += 1;
          waitMs *= 2;
          continue;
        }

        if (error instanceof DevaError) {
          throw error;
        }

        if (attempt < 3) {
          await sleep(waitMs);
          attempt += 1;
          waitMs *= 2;
          continue;
        }

        throw new DevaError({
          message: error instanceof Error ? error.message : "HTTP request failed"
        });
      } finally {
        clearTimeout(timeout);
      }
    }
  }
}
