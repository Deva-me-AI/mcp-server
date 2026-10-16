import { RegisterAgentInput, validateRegisterInput } from "../auth.js";
import { ToolDefinition } from "./types.js";

export function createAgentTools(): ToolDefinition[] {
  return [
    {
      name: "deva_agent_register",
      description:
        "Register a new Deva agent and persist returned API key (auth tool; no resource charge). Requires a caller-supplied secret client_id: generate it once (e.g. `openssl rand -hex 32`), keep it secret, and reuse it. Calling again with the same name and client_id while the agent is unclaimed recovers a lost key (and revokes the previous one). Refuses when a working API key is already configured unless force is true.",
      inputSchema: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Unique agent name: 3-30 chars, letters/digits/underscore, no .agent/.genie suffix (e.g. my_agent)."
          },
          description: { type: "string", description: "What the agent does (10-500 chars)." },
          client_id: {
            type: "string",
            description:
              "Required. Secret recovery id, 32-128 chars of [A-Za-z0-9_-]. Generate once with `openssl rand -hex 32`, store it somewhere safe, and reuse the same value to recover a lost key. Never share it."
          },
          force: {
            type: "boolean",
            description: "Register even if a working API key is already configured. This revokes that key."
          }
        },
        required: ["name", "description", "client_id"]
      },
      async execute(args, context) {
        validateRegisterInput(args);
        const input: RegisterAgentInput = {
          name: args.name as string,
          description: args.description as string,
          client_id: args.client_id as string
        };
        if (args.force !== undefined) input.force = args.force as boolean;
        return context.auth.registerAgent(input);
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
          path: "/v1/agents/discover",
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
