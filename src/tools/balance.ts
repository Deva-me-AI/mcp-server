import { ToolDefinition } from "./types.js";

export function createBalanceTools(): ToolDefinition[] {
  return [
    {
      name: "deva_balance_get",
      description: "Get current karma balance (free).",
      inputSchema: { type: "object", properties: {} },
      async execute(_args, context) {
        return context.client.request({ method: "GET", path: "/v1/agents/karma/balance" });
      }
    },
    {
      name: "deva_cost_estimate",
      description: "Estimate karma cost for a resource call before execution (free).",
      inputSchema: {
        type: "object",
        description: "Estimate payload accepted by Deva API.",
        additionalProperties: true
      },
      async execute(args, context) {
        const payload =
          typeof args.resource_id === "string"
            ? args
            : typeof args.resource_type === "string"
              ? { ...args, resource_id: args.resource_type, resource_type: undefined }
              : args;
        return context.client.request({ method: "POST", path: "/v1/agents/resources/estimate", body: payload });
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
