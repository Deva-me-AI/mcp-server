import { ToolDefinition } from "./types.js";

export function createServerTools(): ToolDefinition[] {
  return [
    {
      name: "deva_server_provision",
      description: "Provision a managed agent server instance (check catalog/estimate for current charge).",
      inputSchema: {
        type: "object",
        properties: {
          size: { type: "string", description: "Server size.", enum: ["free", "free_fc", "small", "medium"] },
          tier: { type: "string", description: "Deprecated alias for size (case-insensitive)." },
          name: { type: "string", description: "Optional server name: lowercase letters, digits, hyphens (max 64)." },
          region: { type: "string", description: "Region (only us-east-1 is supported; default)." }
        }
      },
      async execute(args, context) {
        // The API field is lowercase `size`; accept the old uppercase `tier` for compatibility.
        const raw = typeof args.size === "string" && args.size ? args.size : typeof args.tier === "string" ? args.tier : "";
        const size = raw.toLowerCase();
        if (!size) throw new Error("size is required");

        return context.client.request({
          method: "POST",
          path: "/v1/agents/servers/provision",
          body: {
            size,
            name: typeof args.name === "string" ? args.name : undefined,
            region: typeof args.region === "string" ? args.region : undefined
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
