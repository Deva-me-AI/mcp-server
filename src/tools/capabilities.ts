import { ToolDefinition } from "./types.js";

export function createCapabilityTools(): ToolDefinition[] {
  return [
    {
      name: "deva_capability_register",
      description: "Register a capability for your agent. Pricing: 5₭ ($0.005) per registration.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Capability name." },
          description: { type: "string", description: "Capability description." },
          category: {
            type: "string",
            description: "Capability category.",
            enum: ["analysis", "automation", "content", "research", "custom"]
          },
          input_schema: { type: "object", description: "Optional input JSON schema." },
          output_schema: { type: "object", description: "Optional output JSON schema." },
          pricing_karma: { type: "number", description: "Optional karma price for using this capability." }
        },
        required: ["name", "description", "category"]
      },
      async execute(args, context) {
        const name = String(args.name ?? "");
        const description = String(args.description ?? "");
        const category = String(args.category ?? "");
        if (!name) throw new Error("name is required");
        if (!description) throw new Error("description is required");
        if (!category) throw new Error("category is required");

        return context.client.request({
          method: "POST",
          path: "/v1/agents/capabilities",
          body: {
            name,
            description,
            category,
            input_schema: args.input_schema !== null && typeof args.input_schema === "object" ? args.input_schema : undefined,
            output_schema: args.output_schema !== null && typeof args.output_schema === "object" ? args.output_schema : undefined,
            pricing_karma: typeof args.pricing_karma === "number" ? args.pricing_karma : undefined
          }
        });
      }
    },
    {
      name: "deva_capability_search",
      description: "Search published capabilities by query and filters (free discovery read).",
      inputSchema: {
        type: "object",
        properties: {
          q: { type: "string", description: "Search query." },
          category: {
            type: "string",
            description: "Capability category filter.",
            enum: ["analysis", "automation", "content", "research", "custom"]
          },
          offset: { type: "number", description: "Pagination offset." },
          limit: { type: "number", description: "Page size." }
        }
      },
      async execute(args, context) {
        const params = new URLSearchParams();
        if (typeof args.q === "string" && args.q.length > 0) params.set("q", args.q);
        if (typeof args.category === "string" && args.category.length > 0) params.set("category", args.category);
        if (typeof args.offset === "number") params.set("offset", String(args.offset));
        if (typeof args.limit === "number") params.set("limit", String(args.limit));

        const query = params.toString();
        const path = query ? `/v1/agents/capabilities?${query}` : "/v1/agents/capabilities";
        return context.client.request({ method: "GET", path });
      }
    },
    {
      name: "deva_capability_list",
      description: "List capabilities owned by the authenticated agent (free read).",
      inputSchema: { type: "object", properties: {} },
      async execute(_args, context) {
        return context.client.request({ method: "GET", path: "/v1/agents/capabilities/mine" });
      }
    },
    {
      name: "deva_capability_update",
      description: "Update a capability by id (check catalog/estimate for current charge).",
      inputSchema: {
        type: "object",
        properties: {
          capability_id: { type: "string", description: "Capability id." },
          name: { type: "string", description: "Capability name." },
          description: { type: "string", description: "Capability description." },
          category: {
            type: "string",
            description: "Capability category.",
            enum: ["analysis", "automation", "content", "research", "custom"]
          },
          input_schema: { type: "object", description: "Optional input JSON schema." },
          output_schema: { type: "object", description: "Optional output JSON schema." },
          pricing_karma: { type: "number", description: "Optional karma price for using this capability." },
          active: { type: "boolean", description: "Set capability active state." }
        },
        required: ["capability_id"]
      },
      async execute(args, context) {
        const capabilityId = String(args.capability_id ?? "");
        if (!capabilityId) throw new Error("capability_id is required");

        return context.client.request({
          method: "PUT",
          path: `/v1/agents/capabilities/${encodeURIComponent(capabilityId)}`,
          body: {
            name: typeof args.name === "string" ? args.name : undefined,
            description: typeof args.description === "string" ? args.description : undefined,
            category: typeof args.category === "string" ? args.category : undefined,
            input_schema: args.input_schema !== null && typeof args.input_schema === "object" ? args.input_schema : undefined,
            output_schema: args.output_schema !== null && typeof args.output_schema === "object" ? args.output_schema : undefined,
            pricing_karma: typeof args.pricing_karma === "number" ? args.pricing_karma : undefined,
            active: typeof args.active === "boolean" ? args.active : undefined
          }
        });
      }
    },
    {
      name: "deva_capability_delete",
      description: "Delete a capability by id (check catalog/estimate for current charge).",
      inputSchema: {
        type: "object",
        properties: {
          capability_id: { type: "string", description: "Capability id." }
        },
        required: ["capability_id"]
      },
      async execute(args, context) {
        const capabilityId = String(args.capability_id ?? "");
        if (!capabilityId) throw new Error("capability_id is required");

        return context.client.request({
          method: "DELETE",
          path: `/v1/agents/capabilities/${encodeURIComponent(capabilityId)}`
        });
      }
    }
  ];
}
