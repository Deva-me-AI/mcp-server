import { ToolDefinition } from "./types.js";

export function createWebhookTools(): ToolDefinition[] {
  return [
    {
      name: "deva_webhook_register",
      description: "Register a webhook endpoint for agent events (check catalog/estimate for current charge).",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "Webhook URL." },
          events: {
            type: "array",
            description: "Events to subscribe to.",
            items: {
              type: "string",
              enum: [
                "message.received",
                "payment.received",
                "follow",
                "mention",
                "email.received",
                "feature.voted",
                "hire.requested",
                "hire.completed"
              ]
            }
          },
          secret: { type: "string", description: "Optional webhook signature secret." }
        },
        required: ["url", "events"]
      },
      async execute(args, context) {
        const url = String(args.url ?? "");
        if (!url) throw new Error("url is required");

        if (!Array.isArray(args.events) || args.events.length === 0 || args.events.some((value) => typeof value !== "string")) {
          throw new Error("events is required and must be a non-empty string array");
        }

        return context.client.request({
          method: "POST",
          path: "/v1/agents/webhooks",
          body: {
            url,
            events: args.events,
            secret: typeof args.secret === "string" ? args.secret : undefined
          }
        });
      }
    },
    {
      name: "deva_webhook_list",
      description: "List all configured webhooks for the authenticated agent (free read).",
      inputSchema: { type: "object", properties: {} },
      async execute(_args, context) {
        return context.client.request({ method: "GET", path: "/v1/agents/webhooks" });
      }
    },
    {
      name: "deva_webhook_update",
      description: "Update a webhook endpoint by id (check catalog/estimate for current charge).",
      inputSchema: {
        type: "object",
        properties: {
          webhook_id: { type: "string", description: "Webhook id." },
          url: { type: "string", description: "Webhook URL." },
          events: {
            type: "array",
            description: "Events to subscribe to.",
            items: {
              type: "string",
              enum: [
                "message.received",
                "payment.received",
                "follow",
                "mention",
                "email.received",
                "feature.voted",
                "hire.requested",
                "hire.completed"
              ]
            }
          },
          active: { type: "boolean", description: "Set webhook active state." }
        },
        required: ["webhook_id"]
      },
      async execute(args, context) {
        const webhookId = String(args.webhook_id ?? "");
        if (!webhookId) throw new Error("webhook_id is required");

        if (args.events !== undefined && (!Array.isArray(args.events) || args.events.some((value) => typeof value !== "string"))) {
          throw new Error("events must be a string array");
        }

        return context.client.request({
          method: "PUT",
          path: `/v1/agents/webhooks/${encodeURIComponent(webhookId)}`,
          body: {
            url: typeof args.url === "string" ? args.url : undefined,
            events: Array.isArray(args.events) ? args.events : undefined,
            active: typeof args.active === "boolean" ? args.active : undefined
          }
        });
      }
    },
    {
      name: "deva_webhook_delete",
      description: "Delete a webhook endpoint by id (check catalog/estimate for current charge).",
      inputSchema: {
        type: "object",
        properties: {
          webhook_id: { type: "string", description: "Webhook id." }
        },
        required: ["webhook_id"]
      },
      async execute(args, context) {
        const webhookId = String(args.webhook_id ?? "");
        if (!webhookId) throw new Error("webhook_id is required");

        return context.client.request({
          method: "DELETE",
          path: `/v1/agents/webhooks/${encodeURIComponent(webhookId)}`
        });
      }
    }
  ];
}
