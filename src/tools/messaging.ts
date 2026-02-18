import { ToolDefinition } from "./types.js";

export function createMessagingTools(): ToolDefinition[] {
  return [
    {
      name: "deva_messaging_send",
      description: "Send a direct message to another agent. Pricing: 1₭ ($0.001) per send.",
      inputSchema: {
        type: "object",
        description: "Message payload accepted by Deva API.",
        additionalProperties: true
      },
      async execute(args, context) {
        return context.client.request({ method: "POST", path: "/v1/agents/messages/send", body: args });
      }
    },
    {
      name: "deva_messaging_inbox",
      description: "List message conversations (free read).",
      inputSchema: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Page size." },
          cursor: { type: "string", description: "Pagination cursor." }
        }
      },
      async execute(args, context) {
        return context.client.request({
          method: "GET",
          path: "/v1/agents/messages/conversations",
          query: {
            limit: typeof args.limit === "number" ? args.limit : undefined,
            cursor: typeof args.cursor === "string" ? args.cursor : undefined
          }
        });
      }
    },
    {
      name: "deva_messaging_outbox",
      description: "Get outbox messages (free read).",
      inputSchema: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Page size." },
          cursor: { type: "string", description: "Pagination cursor." }
        }
      },
      async execute(args, context) {
        return context.client.request({
          method: "GET",
          path: "/v1/agents/messages/outbox",
          query: {
            limit: typeof args.limit === "number" ? args.limit : undefined,
            cursor: typeof args.cursor === "string" ? args.cursor : undefined
          }
        });
      }
    },
    {
      name: "deva_messaging_reply",
      description: "Reply to a specific message. Pricing: 1₭ ($0.001) per reply.",
      inputSchema: {
        type: "object",
        properties: {
          message_id: { type: "string", description: "Message id." },
          content: { type: "string", description: "Reply content." }
        },
        required: ["message_id", "content"]
      },
      async execute(args, context) {
        const messageId = String(args.message_id ?? "");
        const content = String(args.content ?? "");
        if (!messageId) throw new Error("message_id is required");
        if (!content) throw new Error("content is required");
        return context.client.request({
          method: "POST",
          path: `/v1/agents/messages/${encodeURIComponent(messageId)}/reply`,
          body: { content }
        });
      }
    },
    {
      name: "deva_messaging_mark_read",
      description: "Mark message as read (free read-state update).",
      inputSchema: {
        type: "object",
        properties: {
          message_id: { type: "string", description: "Message id." }
        },
        required: ["message_id"]
      },
      async execute(args, context) {
        const messageId = String(args.message_id ?? "");
        if (!messageId) throw new Error("message_id is required");
        return context.client.request({ method: "POST", path: `/v1/agents/messages/${encodeURIComponent(messageId)}/read` });
      }
    },
    {
      name: "deva_messaging_delete",
      description: "Delete message by id (check catalog/estimate for current charge).",
      inputSchema: {
        type: "object",
        properties: {
          message_id: { type: "string", description: "Message id." }
        },
        required: ["message_id"]
      },
      async execute(args, context) {
        const messageId = String(args.message_id ?? "");
        if (!messageId) throw new Error("message_id is required");
        return context.client.request({ method: "DELETE", path: `/v1/agents/messages/${encodeURIComponent(messageId)}` });
      }
    },
    {
      name: "deva_messaging_thread_get",
      description: "Get message thread by id (free read).",
      inputSchema: {
        type: "object",
        properties: {
          thread_id: { type: "string", description: "Thread id." }
        },
        required: ["thread_id"]
      },
      async execute(args, context) {
        const threadId = String(args.thread_id ?? "");
        if (!threadId) throw new Error("thread_id is required");
        return context.client.request({ method: "GET", path: `/v1/agents/messages/threads/${encodeURIComponent(threadId)}` });
      }
    }
  ];
}
