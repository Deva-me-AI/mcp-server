import { lstat, mkdtemp, open, rename, rm } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { DevaClient } from "../deva-client.js";
import { asString, ToolDefinition } from "./types.js";

const ROOT = "/v1/agents/resources";
const outputFile = { type: "string", minLength: 1, description: "Write the full JSON response to this local path; return only a summary and path. Relative paths use the server working directory. Replaces an existing file." };
const requestProperties = {
  slug: { type: "string", minLength: 1, description: "Exact slug from discover." },
  params: { type: "object", additionalProperties: true, description: "Input matching inspect's input_schema." },
  maxTotalChargeUsd: { type: "number", minimum: 0.001, maximum: 1e9, description: "Maximum charge in credits (1 credit = $1), using the REST API field name." }
};

function body(args: Record<string, unknown>): Record<string, unknown> {
  const slug = asString(args.slug, "slug");
  if (args.params !== undefined && (!args.params || typeof args.params !== "object" || Array.isArray(args.params))) {
    throw new Error("params must be an object");
  }
  const cap = args.maxTotalChargeUsd;
  if (cap !== undefined && (typeof cap !== "number" || !Number.isFinite(cap) || cap < 0.001 || cap > 1e9)) {
    throw new Error("maxTotalChargeUsd must be between 0.001 and 1000000000");
  }
  return { slug, params: args.params ?? {}, ...(cap === undefined ? {} : { maxTotalChargeUsd: cap }) };
}

/** Resolve a bounded credit ceiling before reserving local spend. */
export async function prepareRailRun(args: Record<string, unknown>, client: DevaClient): Promise<Record<string, unknown>> {
  const payload = body(args);
  if (payload.maxTotalChargeUsd !== undefined) return args;
  const estimate = await client.request<Record<string, unknown>>({
    method: "POST", path: `${ROOT}/estimate`, body: payload, requiresAuth: false
  });
  const credits = estimate?.amount_credits;
  if (typeof credits !== "number" || !Number.isFinite(credits) || credits < 0.001 || credits > 1e9) {
    throw new Error("Estimate has no valid credit ceiling; provide maxTotalChargeUsd explicitly");
  }
  return { ...args, maxTotalChargeUsd: credits };
}

async function result(args: Record<string, unknown>, request: () => Promise<Record<string, unknown>>): Promise<unknown> {
  const path = args.output_file === undefined ? undefined : resolve(asString(args.output_file, "output_file"));
  // A private directory prevents other users from replacing staging entries.
  // Keep the exclusively created handle open across the request: never reopen
  // a pathname that could have been substituted while awaiting the response.
  const staging = path === undefined ? undefined : await mkdtemp(join(dirname(path), ".deva-output-"));
  const temporary = staging === undefined ? undefined : join(staging, "response.json");
  let file: FileHandle | undefined;
  try {
    if (temporary) file = await open(temporary, "wx", 0o600);
    const payload = await request();
    const polling = !["succeeded", "failed", "completed", "cancelled", "canceled"].includes(String(payload.status));
    const guidance = polling ? { next_action: "Poll deva_tools_get_run with run_id until terminal. Do not submit the run again." } : {};
    if (!path || !temporary || !file) return { ...payload, ...guidance };
    const summary = {
      run_id: payload.run_id,
      status: payload.status,
      credits_charged: payload.credits_charged,
      max_total_charge_credits: payload.max_total_charge_credits,
      result_count: payload.result_count ?? (Array.isArray(payload.items) ? payload.items.length : undefined),
      ...guidance
    };
    try {
      await file.writeFile(JSON.stringify(payload, null, 2));
      const original = await file.stat();
      const staged = await lstat(temporary);
      if (!staged.isFile() || staged.dev !== original.dev || staged.ino !== original.ino) {
        throw new Error("Staging file was replaced");
      }
      await rename(temporary, path);
      return { ...summary, summary: "Full response written to output_file.", output_file: path };
    } catch {
      // Keep the run handle visible if a disk fails after a paid run has started.
      return { ...summary, output_file: path, output_file_error: "Could not save the response. Retrieve it with deva_tools_get_run; do not rerun the paid tool." };
    }
  } finally {
    await file?.close().catch(() => {});
    if (staging) await rm(staging, { recursive: true, force: true }).catch(() => {});
  }
}

export function createRailTools(): ToolDefinition[] {
  return [
    {
      name: "deva_tools_discover",
      description: "Discover tools across all providers (free; spends no credits). Inspect a returned slug before estimating or running it.",
      inputSchema: { type: "object", properties: {
        ...Object.fromEntries(["q", "category", "provider", "status", "cursor"].map(key => [key, { type: "string" }])),
        limit: { type: "integer", minimum: 1, maximum: 100 },
        min_score: { type: "number", minimum: 0, maximum: 1 }
      }, additionalProperties: false },
      async execute(args, { client }) {
        const query: Record<string, string | number> = {};
        for (const key of ["q", "category", "provider", "status", "cursor"]) {
          if (args[key] !== undefined) {
            if (typeof args[key] !== "string") throw new Error(`${key} must be a string`);
            query[key] = args[key];
          }
        }
        for (const key of ["limit", "min_score"]) {
          const value = args[key];
          if (value === undefined) continue;
          if (typeof value !== "number" || !Number.isFinite(value) || (key === "limit" ? !Number.isInteger(value) || value < 1 || value > 100 : value < 0 || value > 1)) throw new Error(`Invalid ${key}`);
          query[key] = value;
        }
        return client.request({ method: "GET", path: `${ROOT}/discover`, query, requiresAuth: false });
      }
    },
    {
      name: "deva_tools_inspect",
      description: "Inspect a tool's input_schema, pricing, defaults and caps (free; spends no credits).",
      inputSchema: { type: "object", properties: { slug: requestProperties.slug }, required: ["slug"], additionalProperties: false },
      async execute(args, { client }) {
        return client.request({ method: "GET", path: `${ROOT}/inspect/${encodeURIComponent(asString(args.slug, "slug"))}`, requiresAuth: false });
      }
    },
    {
      name: "deva_tools_estimate",
      description: "Estimate a tool run's cost (free; spends no credits). Variable pricing may require an explicit run cap.",
      inputSchema: { type: "object", properties: requestProperties, required: ["slug"], additionalProperties: false },
      async execute(args, { client }) {
        return client.request({ method: "POST", path: `${ROOT}/estimate`, body: body(args), requiresAuth: false });
      }
    },
    {
      name: "deva_tools_run",
      description: "Run a discovered tool. Spends credits; inspect and estimate first. Returns run_id and status. For async runs poll deva_tools_get_run until terminal. Never automatically retry a run. Use output_file for large output. Local spend caps must be configured.",
      inputSchema: { type: "object", properties: { ...requestProperties, output_file: outputFile }, required: ["slug"], additionalProperties: false },
      async execute(args, { client, maxRunCredits, onRailRunSubmitted }) {
        const payload = body(args);
        const { slug, ...input } = payload;
        if (maxRunCredits !== undefined) {
          input.maxTotalChargeUsd = Math.min((input.maxTotalChargeUsd as number | undefined) ?? maxRunCredits, maxRunCredits);
          if ((input.maxTotalChargeUsd as number) < 0.001) throw new Error("Remaining local budget is below the minimum run cap");
        }
        return result(args, () => {
          onRailRunSubmitted?.();
          return client.request({ method: "POST", path: `${ROOT}/run/${encodeURIComponent(String(slug))}`, body: input, maxRetries: 0 });
        });
      }
    },
    {
      name: "deva_tools_get_run",
      description: "Get a run's status and output without starting another paid run. Poll async runs with run_id until terminal. Use output_file to keep large results out of context. Can overwrite local files; requires local policy enablement.",
      inputSchema: { type: "object", properties: { run_id: { type: "string", minLength: 1 }, output_file: outputFile }, required: ["run_id"], additionalProperties: false },
      async execute(args, { client }) {
        const id = asString(args.run_id, "run_id");
        return result(args, () => client.request({ method: "GET", path: `${ROOT}/runs/${encodeURIComponent(id)}` }));
      }
    }
  ];
}
