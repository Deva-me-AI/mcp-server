import { ToolDefinition } from "./types.js";

export function createServerTools(): ToolDefinition[] {
  return [
    {
      name: "deva_server_provision",
      description: "Provision a managed agent server instance (check catalog/estimate for current charge).",
      inputSchema: {
        type: "object",
        properties: {
          tier: { type: "string", description: "Server tier.", enum: ["FREE", "SMALL", "MEDIUM"] },
          name: { type: "string", description: "Optional server name." },
          description: { type: "string", description: "Optional server description." }
        },
        required: ["tier"]
      },
      async execute(args, context) {
        const tier = String(args.tier ?? "");
        if (!tier) throw new Error("tier is required");

        return context.client.request({
          method: "POST",
          path: "/v1/agents/servers",
          body: {
            tier,
            name: typeof args.name === "string" ? args.name : undefined,
            description: typeof args.description === "string" ? args.description : undefined
          }
        });
      }
    },
    {
      name: "deva_server_list",
      description: "List provisioned agent servers (free read).",
      inputSchema: { type: "object", properties: {} },
      async execute(_args, context) {
        return context.client.request({ method: "GET", path: "/v1/agents/servers" });
      }
    },
    {
      name: "deva_server_delete",
      description: "Delete a provisioned server by id (check catalog/estimate for current charge).",
      inputSchema: {
        type: "object",
        properties: {
          server_id: { type: "string", description: "Server id." }
        },
        required: ["server_id"]
      },
      async execute(args, context) {
        const serverId = String(args.server_id ?? "");
        if (!serverId) throw new Error("server_id is required");

        return context.client.request({
          method: "DELETE",
          path: `/v1/agents/servers/${encodeURIComponent(serverId)}`
        });
      }
    }
  ];
}
