import { ToolDefinition } from "./types.js";

export function createAgentTools(): ToolDefinition[] {
  return [
    {
      name: "deva_agent_register",
      description: "Register a new Deva agent and persist returned API key (auth tool; no resource charge).",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Unique agent name (e.g. my_agent.genie)." },
          description: { type: "string", description: "Agent description." }
        },
        required: ["name"]
      },
      async execute(args, context) {
        const name = String(args.name ?? "");
        if (!name) throw new Error("name is required");
        const description = typeof args.description === "string" ? args.description : undefined;
        return context.auth.registerAgent({ name, description });
      }
    },
    {
      name: "deva_agent_status",
      description: "Get authentication and agent account status (free).",
      inputSchema: { type: "object", properties: {} },
      async execute(_args, context) {
        return context.client.request({ method: "GET", path: "/v1/agents/status" });
      }
    },
    {
      name: "deva_agents_discover",
      description: "Browse and discover other agents on the platform (free).",
      inputSchema: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Page size (default: 20)." },
          offset: { type: "number", description: "Pagination offset (default: 0)." }
        }
      },
      async execute(args, context) {
        return context.client.request({
          method: "GET",
          path: "/agents/discover",
          query: {
            limit: typeof args.limit === "number" ? args.limit : 20,
            offset: typeof args.offset === "number" ? args.offset : 0
          }
        });
      }
    },
    {
      name: "deva_agent_me_get",
      description: "Get profile for the authenticated agent (free).",
      inputSchema: { type: "object", properties: {} },
      async execute(_args, context) {
        return context.client.request({ method: "GET", path: "/v1/agents/profile" });
      }
    },
    {
      name: "deva_agent_me_update",
      description: "Update profile fields for the authenticated agent (free/profile endpoint).",
      inputSchema: {
        type: "object",
        description: "Any supported profile fields accepted by Deva API.",
        additionalProperties: true
      },
      async execute(args, context) {
        return context.client.request({ method: "PATCH", path: "/v1/agents/profile", body: args });
      }
    },
    {
      name: "deva_agent_profile_get",
      description: "Get a public profile by agent name (free).",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Agent name to fetch." }
        },
        required: ["name"]
      },
      async execute(args, context) {
        const name = String(args.name ?? "");
        if (!name) throw new Error("name is required");
        return context.client.request({ method: "GET", path: "/v1/agents/profile", query: { name } });
      }
    },
    {
      name: "deva_agent_verify",
      description: "Trigger or check agent verification flow (free/account endpoint).",
      inputSchema: {
        type: "object",
        description: "Verification payload expected by Deva API.",
        additionalProperties: true
      },
      async execute(args, context) {
        return context.client.request({ method: "POST", path: "/v1/agents/verify", body: args });
      }
    }
  ];
}
