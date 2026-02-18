import { ToolDefinition } from "./types.js";

export function createStorageTools(): ToolDefinition[] {
  return [
    {
      name: "deva_storage_kv_set",
      description: "Set a KV value for a key. Pricing: 1₭ ($0.001) per write.",
      inputSchema: {
        type: "object",
        properties: {
          key: { type: "string", description: "KV key." },
          value: { description: "Value to store (JSON serializable)." }
        },
        required: ["key", "value"]
      },
      async execute(args, context) {
        const key = String(args.key ?? "");
        if (!key) throw new Error("key is required");
        return context.client.request({
          method: "PUT",
          path: `/v1/agents/kv/${encodeURIComponent(key)}`,
          body: { value: args.value }
        });
      }
    },
    {
      name: "deva_storage_kv_get",
      description: "Get a KV value by key (free read).",
      inputSchema: {
        type: "object",
        properties: {
          key: { type: "string", description: "KV key." }
        },
        required: ["key"]
      },
      async execute(args, context) {
        const key = String(args.key ?? "");
        if (!key) throw new Error("key is required");
        return context.client.request({ method: "GET", path: `/v1/agents/kv/${encodeURIComponent(key)}` });
      }
    },
    {
      name: "deva_storage_kv_delete",
      description: "Delete a KV value by key. Pricing: 1₭ ($0.001) per write.",
      inputSchema: {
        type: "object",
        properties: {
          key: { type: "string", description: "KV key." }
        },
        required: ["key"]
      },
      async execute(args, context) {
        const key = String(args.key ?? "");
        if (!key) throw new Error("key is required");
        return context.client.request({ method: "DELETE", path: `/v1/agents/kv/${encodeURIComponent(key)}` });
      }
    },
    {
      name: "deva_storage_kv_list",
      description: "List KV keys and values (free read).",
      inputSchema: {
        type: "object",
        properties: {
          prefix: { type: "string", description: "Optional key prefix filter." },
          limit: { type: "number", description: "Page size." },
          cursor: { type: "string", description: "Pagination cursor." }
        }
      },
      async execute(args, context) {
        return context.client.request({
          method: "GET",
          path: "/v1/agents/kv",
          query: {
            prefix: typeof args.prefix === "string" ? args.prefix : undefined,
            limit: typeof args.limit === "number" ? args.limit : undefined,
            cursor: typeof args.cursor === "string" ? args.cursor : undefined
          }
        });
      }
    },
    {
      name: "deva_storage_file_upload",
      description: "Request a presigned upload URL for a file. Pricing: 1₭ ($0.001) per upload.",
      inputSchema: {
        type: "object",
        description: "Upload payload accepted by Deva API.",
        additionalProperties: true
      },
      async execute(args, context) {
        return context.client.request({ method: "POST", path: "/v1/agents/files/upload", body: args });
      }
    },
    {
      name: "deva_storage_file_download",
      description: "Get metadata or download URL for a file path (free download/read).",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path." }
        },
        required: ["path"]
      },
      async execute(args, context) {
        const filePath = String(args.path ?? "");
        if (!filePath) throw new Error("path is required");
        return context.client.request({ method: "GET", path: `/v1/agents/files/${encodeURIComponent(filePath)}` });
      }
    },
    {
      name: "deva_storage_file_delete",
      description: "Delete a file by path (check catalog/estimate for current charge).",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path." }
        },
        required: ["path"]
      },
      async execute(args, context) {
        const filePath = String(args.path ?? "");
        if (!filePath) throw new Error("path is required");
        return context.client.request({ method: "DELETE", path: `/v1/agents/files/${encodeURIComponent(filePath)}` });
      }
    },
    {
      name: "deva_storage_file_list",
      description: "List files in storage (free read).",
      inputSchema: {
        type: "object",
        properties: {
          prefix: { type: "string", description: "Prefix filter." },
          limit: { type: "number", description: "Page size." },
          cursor: { type: "string", description: "Pagination cursor." }
        }
      },
      async execute(args, context) {
        return context.client.request({
          method: "GET",
          path: "/v1/agents/files",
          query: {
            prefix: typeof args.prefix === "string" ? args.prefix : undefined,
            limit: typeof args.limit === "number" ? args.limit : undefined,
            cursor: typeof args.cursor === "string" ? args.cursor : undefined
          }
        });
      }
    }
  ];
}
