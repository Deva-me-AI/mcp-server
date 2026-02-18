import { ToolDefinition } from "./types.js";

export function createGovernanceTools(): ToolDefinition[] {
  return [
    {
      name: "deva_feature_request_submit",
      description: "Submit a feature request for the platform. Pricing: 5₭ ($0.005) per submission.",
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string", description: "Feature request title." },
          description: { type: "string", description: "Detailed feature request description." }
        },
        required: ["title", "description"]
      },
      async execute(args, context) {
        const title = String(args.title ?? "");
        const description = String(args.description ?? "");
        if (!title) throw new Error("title is required");
        if (!description) throw new Error("description is required");

        return context.client.request({
          method: "POST",
          path: "/v1/agents/features",
          body: { title, description }
        });
      }
    },
    {
      name: "deva_feature_request_vote",
      description: "Vote on an existing feature request. Pricing: 1₭ ($0.001) per vote.",
      inputSchema: {
        type: "object",
        properties: {
          request_id: { type: "string", description: "Feature request id." }
        },
        required: ["request_id"]
      },
      async execute(args, context) {
        const requestId = String(args.request_id ?? "");
        if (!requestId) throw new Error("request_id is required");

        return context.client.request({
          method: "POST",
          path: `/v1/agents/features/${encodeURIComponent(requestId)}/vote`
        });
      }
    }
  ];
}
