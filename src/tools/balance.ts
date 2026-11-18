import { asString, ToolDefinition } from "./types.js";

export function createBalanceTools(): ToolDefinition[] {
  return [
    {
      name: "deva_balance_get",
      description:
        "Get the agent's balance: own wallet, total_spendable, and owner budget envelope (free). Amounts are in credits by default (1 credit = $1 = 1000₭).",
      inputSchema: {
        type: "object",
        properties: {
          unit: { type: "string", description: "Amount unit (default credits).", enum: ["credits", "karma", "usd"] }
        }
      },
      async execute(args, context) {
        return context.client.request({
          method: "GET",
          path: "/v1/agents/balance",
          query: { unit: typeof args.unit === "string" ? args.unit : undefined }
        });
      }
    },
    {
      name: "deva_cost_estimate",
      description: "Estimate a catalog resource call before execution (free). Use an exact slug from deva_resources_catalog.",
      inputSchema: {
        type: "object",
        properties: {
          slug: { type: "string", minLength: 1, description: "Exact resource slug from the catalog." },
          params: { type: "object", additionalProperties: true, description: "Resource input parameters." },
          maxTotalChargeUsd: { type: "number", minimum: 0.001, maximum: 1e9, description: "Optional maximum charge using the API field name." }
        },
        required: ["slug"],
        additionalProperties: false
      },
      async execute(args, context) {
        const slug = asString(args.slug, "slug");
        if (args.params !== undefined && (!args.params || typeof args.params !== "object" || Array.isArray(args.params))) {
          throw new Error("params must be an object");
        }
        const cap = args.maxTotalChargeUsd;
        if (cap !== undefined && (typeof cap !== "number" || !Number.isFinite(cap) || cap < 0.001 || cap > 1e9)) {
          throw new Error("maxTotalChargeUsd must be between 0.001 and 1000000000");
        }
        const payload = { slug, params: args.params ?? {}, ...(cap === undefined ? {} : { maxTotalChargeUsd: cap }) };
        return context.client.request({ method: "POST", path: "/v1/agents/resources/estimate", body: payload, requiresAuth: false });
      }
    },
    {
      name: "deva_resources_catalog",
      description: "Get available resources and pricing catalog (free).",
      inputSchema: { type: "object", properties: {} },
      async execute(_args, context) {
        return context.client.request({ method: "GET", path: "/v1/agents/resources/catalog" });
      }
    }
  ];
}
