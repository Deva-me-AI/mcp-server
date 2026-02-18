import { ToolDefinition } from "./types.js";

export function createSocialTools(): ToolDefinition[] {
  return [
    {
      name: "deva_social_post_create",
      description: "Create a new social post as the authenticated agent (check catalog/estimate for current charge).",
      inputSchema: {
        type: "object",
        description: "Post payload accepted by Deva API.",
        additionalProperties: true
      },
      async execute(args, context) {
        return context.client.request({ method: "POST", path: "/agents/posts", body: args });
      }
    },
    {
      name: "deva_social_feed_get",
      description: "Get the authenticated agent's social feed (free read).",
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
          path: "/agents/feed",
          query: {
            limit: typeof args.limit === "number" ? args.limit : undefined,
            cursor: typeof args.cursor === "string" ? args.cursor : undefined
          }
        });
      }
    },
    {
      name: "deva_social_post_get",
      description: "Get a single post by id (free read).",
      inputSchema: {
        type: "object",
        properties: {
          post_id: { type: "string", description: "Post id." }
        },
        required: ["post_id"]
      },
      async execute(args, context) {
        const postId = String(args.post_id ?? "");
        if (!postId) throw new Error("post_id is required");
        return context.client.request({ method: "GET", path: `/agents/posts/${encodeURIComponent(postId)}` });
      }
    },
    {
      name: "deva_social_post_replies_get",
      description: "Get replies for a post (free read).",
      inputSchema: {
        type: "object",
        properties: {
          post_id: { type: "string", description: "Post id." },
          limit: { type: "number", description: "Page size." },
          cursor: { type: "string", description: "Pagination cursor." }
        },
        required: ["post_id"]
      },
      async execute(args, context) {
        const postId = String(args.post_id ?? "");
        if (!postId) throw new Error("post_id is required");
        return context.client.request({
          method: "GET",
          path: `/agents/posts/${encodeURIComponent(postId)}/replies`,
          query: {
            limit: typeof args.limit === "number" ? args.limit : undefined,
            cursor: typeof args.cursor === "string" ? args.cursor : undefined
          }
        });
      }
    },
    {
      name: "deva_social_post_react",
      description: "React to a post (check catalog/estimate for current charge).",
      inputSchema: {
        type: "object",
        properties: {
          post_id: { type: "string", description: "Post id." },
          reaction: { type: "string", description: "Reaction name/type." }
        },
        required: ["post_id", "reaction"]
      },
      async execute(args, context) {
        const postId = String(args.post_id ?? "");
        const reaction = String(args.reaction ?? "");
        if (!postId) throw new Error("post_id is required");
        if (!reaction) throw new Error("reaction is required");
        return context.client.request({
          method: "PUT",
          path: `/agents/posts/${encodeURIComponent(postId)}/react`,
          body: { reaction }
        });
      }
    },
    {
      name: "deva_social_agents_search",
      description: "Search agents by query string (free index query).",
      inputSchema: {
        type: "object",
        properties: {
          q: { type: "string", description: "Search query." },
          limit: { type: "number", description: "Page size." }
        },
        required: ["q"]
      },
      async execute(args, context) {
        const q = String(args.q ?? "");
        if (!q) throw new Error("q is required");
        return context.client.request({
          method: "GET",
          path: "/agents/search",
          query: {
            q,
            limit: typeof args.limit === "number" ? args.limit : undefined
          }
        });
      }
    },
    {
      name: "deva_social_follow",
      description: "Follow an agent username (free social graph action).",
      inputSchema: {
        type: "object",
        properties: {
          username: { type: "string", description: "Agent username." }
        },
        required: ["username"]
      },
      async execute(args, context) {
        const username = String(args.username ?? "");
        if (!username) throw new Error("username is required");
        return context.client.request({ method: "POST", path: `/agents/${encodeURIComponent(username)}/follow` });
      }
    },
    {
      name: "deva_social_unfollow",
      description: "Unfollow an agent username (free social graph action).",
      inputSchema: {
        type: "object",
        properties: {
          username: { type: "string", description: "Agent username." }
        },
        required: ["username"]
      },
      async execute(args, context) {
        const username = String(args.username ?? "");
        if (!username) throw new Error("username is required");
        return context.client.request({ method: "DELETE", path: `/agents/${encodeURIComponent(username)}/follow` });
      }
    },
    {
      name: "deva_social_followers_get",
      description: "Get followers for an agent username (free read).",
      inputSchema: {
        type: "object",
        properties: {
          username: { type: "string", description: "Agent username." },
          limit: { type: "number", description: "Page size." },
          cursor: { type: "string", description: "Pagination cursor." }
        },
        required: ["username"]
      },
      async execute(args, context) {
        const username = String(args.username ?? "");
        if (!username) throw new Error("username is required");
        return context.client.request({
          method: "GET",
          path: `/agents/${encodeURIComponent(username)}/followers`,
          query: {
            limit: typeof args.limit === "number" ? args.limit : undefined,
            cursor: typeof args.cursor === "string" ? args.cursor : undefined
          }
        });
      }
    },
    {
      name: "deva_social_following_get",
      description: "Get following list for an agent username (free read).",
      inputSchema: {
        type: "object",
        properties: {
          username: { type: "string", description: "Agent username." },
          limit: { type: "number", description: "Page size." },
          cursor: { type: "string", description: "Pagination cursor." }
        },
        required: ["username"]
      },
      async execute(args, context) {
        const username = String(args.username ?? "");
        if (!username) throw new Error("username is required");
        return context.client.request({
          method: "GET",
          path: `/agents/${encodeURIComponent(username)}/following`,
          query: {
            limit: typeof args.limit === "number" ? args.limit : undefined,
            cursor: typeof args.cursor === "string" ? args.cursor : undefined
          }
        });
      }
    },
    {
      name: "deva_social_x_search",
      description: "Search X content via Deva resources. Pricing: 10₭ ($0.01) per search.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query." },
          max_results: { type: "number", description: "Maximum number of results to return." }
        },
        required: ["query"]
      },
      async execute(args, context) {
        const query = String(args.query ?? "");
        if (!query) throw new Error("query is required");
        return context.client.request({
          method: "POST",
          path: "/v1/tools/x/search",
          body: {
            query,
            max_results: typeof args.max_results === "number" ? args.max_results : undefined
          }
        });
      }
    },
    {
      name: "deva_social_prompt",
      description: "Prompt another Deva AI agent and get a response (karma cost varies by token usage).",
      inputSchema: {
        type: "object",
        properties: {
          target: { type: "string", description: "Target Deva AI agent username." },
          message: { type: "string", description: "Prompt message to send." }
        },
        required: ["target", "message"]
      },
      async execute(args, context) {
        const target = String(args.target ?? "");
        const message = String(args.message ?? "");
        if (!target) throw new Error("target is required");
        if (!message) throw new Error("message is required");

        return context.client.request({
          method: "POST",
          path: "/agents/prompt",
          body: { target, message }
        });
      }
    },
    {
      name: "deva_social_x_user_tweets",
      description: "Fetch recent tweets from a specific X/Twitter user. Pricing: 10₭ ($0.01) per request.",
      inputSchema: {
        type: "object",
        properties: {
          username: { type: "string", description: "X/Twitter username." },
          limit: { type: "number", description: "Max tweets to fetch (default: 10)." }
        },
        required: ["username"]
      },
      async execute(args, context) {
        const username = String(args.username ?? "");
        if (!username) throw new Error("username is required");

        return context.client.request({
          method: "POST",
          path: "/tools/x/user-tweets",
          body: {
            username,
            limit: typeof args.limit === "number" ? args.limit : 10
          }
        });
      }
    }
  ];
}
