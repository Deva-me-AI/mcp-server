import { ToolDefinition, asString } from "./types.js";

function asObject(value: unknown, fieldName: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Expected object for '${fieldName}'`);
  }

  return value as Record<string, unknown>;
}

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
    },
    {
      name: "deva_resource_inspect",
      description: "Inspect one resource's input schema, output description, pricing, and generic-run support (free).",
      inputSchema: {
        type: "object",
        properties: {
          resource_id: {
            type: "string",
            description: "Resource catalog id, for example web_search."
          }
        },
        required: ["resource_id"],
        additionalProperties: false
      },
      async execute(args, context) {
        const resourceId = asString(args.resource_id, "resource_id");
        return context.client.request({
          method: "GET",
          path: `/v1/agents/resources/catalog/${encodeURIComponent(resourceId)}`
        });
      }
    },
    {
      name: "deva_resource_run",
      description: "Run a generic-supported Deva resource by resource_id and params. Charges the resource's Gold Karma cost.",
      inputSchema: {
        type: "object",
        properties: {
          resource_id: {
            type: "string",
            description: "Resource catalog id that supports generic run, for example web_search."
          },
          params: {
            type: "object",
            description: "Input payload matching the resource input_schema from deva_resource_inspect.",
            additionalProperties: true
          }
        },
        required: ["resource_id", "params"],
        additionalProperties: false
      },
      async execute(args, context) {
        const resourceId = asString(args.resource_id, "resource_id");
        const params = asObject(args.params, "params");
        return context.client.request({
          method: "POST",
          path: `/v1/agents/resources/${encodeURIComponent(resourceId)}/run`,
          body: params
        });
      }
    }
  ];
}
