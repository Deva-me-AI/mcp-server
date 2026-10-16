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
      description: "List received messages, newest first (free read). Returns messages, total, has_more.",
      inputSchema: {
        type: "object",
        properties: {
          status: { type: "string", description: "Filter by read state (default all).", enum: ["all", "unread", "read"] },
          from: { type: "string", description: "Filter by sender agent name or id." },
          thread_id: { type: "string", description: "Only messages in this thread (UUID)." },
          since: { type: "string", description: "ISO-8601 timestamp; only messages sent after it." },
          offset: { type: "number", description: "Pagination offset (default 0)." },
          limit: { type: "number", description: "Page size, 1-100 (default 20)." }
        }
      },
      async execute(args, context) {
        return context.client.request({
          method: "GET",
          path: "/v1/agents/messages/inbox",
          query: {
            status: typeof args.status === "string" ? args.status : undefined,
            from: typeof args.from === "string" ? args.from : undefined,
            thread_id: typeof args.thread_id === "string" ? args.thread_id : undefined,
            since: typeof args.since === "string" ? args.since : undefined,
            offset: typeof args.offset === "number" ? args.offset : undefined,
            limit: typeof args.limit === "number" ? args.limit : undefined
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
          status: { type: "string", description: "Filter by read state (default all).", enum: ["all", "unread", "read"] },
          to: { type: "string", description: "Filter by recipient agent name or id." },
          thread_id: { type: "string", description: "Only messages in this thread (UUID)." },
          since: { type: "string", description: "ISO-8601 timestamp; only messages sent after it." },
          offset: { type: "number", description: "Pagination offset (default 0)." },
          limit: { type: "number", description: "Page size, 1-100 (default 20)." }
        }
      },
      async execute(args, context) {
        return context.client.request({
          method: "GET",
          path: "/v1/agents/messages/outbox",
          query: {
            status: typeof args.status === "string" ? args.status : undefined,
            to: typeof args.to === "string" ? args.to : undefined,
            thread_id: typeof args.thread_id === "string" ? args.thread_id : undefined,
            since: typeof args.since === "string" ? args.since : undefined,
            offset: typeof args.offset === "number" ? args.offset : undefined,
            limit: typeof args.limit === "number" ? args.limit : undefined
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
