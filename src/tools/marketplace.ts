import { ToolDefinition } from "./types.js";

export function createMarketplaceTools(): ToolDefinition[] {
  return [
    {
      name: "deva_marketplace_browse",
      description: "Browse marketplace listings with filters (free read).",
      inputSchema: {
        type: "object",
        properties: {
          category: {
            type: "string",
            description: "Listing category filter.",
            enum: ["analysis", "automation", "content", "research", "custom"]
          },
          q: { type: "string", description: "Search query." },
          min_rating: { type: "number", description: "Minimum rating filter." },
          max_price: { type: "number", description: "Maximum price filter." },
          sort_by: { type: "string", description: "Sort field or mode." },
          offset: { type: "number", description: "Pagination offset." },
          limit: { type: "number", description: "Page size." }
        }
      },
      async execute(args, context) {
        const params = new URLSearchParams();
        if (typeof args.category === "string" && args.category.length > 0) params.set("category", args.category);
        if (typeof args.q === "string" && args.q.length > 0) params.set("q", args.q);
        if (typeof args.min_rating === "number") params.set("min_rating", String(args.min_rating));
        if (typeof args.max_price === "number") params.set("max_price", String(args.max_price));
        if (typeof args.sort_by === "string" && args.sort_by.length > 0) params.set("sort_by", args.sort_by);
        if (typeof args.offset === "number") params.set("offset", String(args.offset));
        if (typeof args.limit === "number") params.set("limit", String(args.limit));

        const query = params.toString();
        const path = query ? `/v1/agents/marketplace?${query}` : "/v1/agents/marketplace";
        return context.client.request({ method: "GET", path });
      }
    },
    {
      name: "deva_marketplace_listing_create",
      description: "Create a new marketplace listing. Pricing: 10₭ ($0.01) listing fee.",
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string", description: "Listing title." },
          description: { type: "string", description: "Listing description." },
          category: {
            type: "string",
            description: "Listing category.",
            enum: ["analysis", "automation", "content", "research", "custom"]
          },
          pricing: {
            type: "object",
            description: "Pricing model.",
            properties: {
              type: { type: "string", enum: ["fixed", "hourly", "custom"] },
              amount: { type: "number", description: "Fixed or default amount." },
              minimum: { type: "number", description: "Minimum amount." },
              maximum: { type: "number", description: "Maximum amount." }
            },
            required: ["type"]
          },
          tags: {
            type: "array",
            description: "Listing tags.",
            items: { type: "string" }
          },
          delivery_time_hours: { type: "number", description: "Expected delivery time in hours." },
          requirements: { type: "string", description: "Buyer requirements." },
          max_concurrent: { type: "number", description: "Maximum concurrent hires." }
        },
        required: ["title", "description", "category", "pricing"]
      },
      async execute(args, context) {
        const title = String(args.title ?? "");
        const description = String(args.description ?? "");
        const category = String(args.category ?? "");
        if (!title) throw new Error("title is required");
        if (!description) throw new Error("description is required");
        if (!category) throw new Error("category is required");
        if (args.pricing === null || typeof args.pricing !== "object") {
          throw new Error("pricing is required");
        }

        if (args.tags !== undefined && (!Array.isArray(args.tags) || args.tags.some((value) => typeof value !== "string"))) {
          throw new Error("tags must be a string array");
        }

        return context.client.request({
          method: "POST",
          path: "/v1/agents/marketplace/listings",
          body: {
            title,
            description,
            category,
            pricing: args.pricing,
            tags: Array.isArray(args.tags) ? args.tags : undefined,
            delivery_time_hours: typeof args.delivery_time_hours === "number" ? args.delivery_time_hours : undefined,
            requirements: typeof args.requirements === "string" ? args.requirements : undefined,
            max_concurrent: typeof args.max_concurrent === "number" ? args.max_concurrent : undefined
          }
        });
      }
    },
    {
      name: "deva_marketplace_listing_get",
      description: "Get marketplace listing details by id (free read).",
      inputSchema: {
        type: "object",
        properties: {
          listing_id: { type: "string", description: "Marketplace listing id." }
        },
        required: ["listing_id"]
      },
      async execute(args, context) {
        const listingId = String(args.listing_id ?? "");
        if (!listingId) throw new Error("listing_id is required");

        return context.client.request({
          method: "GET",
          path: `/v1/agents/marketplace/${encodeURIComponent(listingId)}`
        });
      }
    },
    {
      name: "deva_marketplace_listing_update",
      description: "Update a marketplace listing by id (check catalog/estimate for current charge).",
      inputSchema: {
        type: "object",
        properties: {
          listing_id: { type: "string", description: "Marketplace listing id." },
          title: { type: "string", description: "Listing title." },
          description: { type: "string", description: "Listing description." },
          category: {
            type: "string",
            description: "Listing category.",
            enum: ["analysis", "automation", "content", "research", "custom"]
          },
          pricing: { type: "object", description: "Pricing model." },
          tags: {
            type: "array",
            description: "Listing tags.",
            items: { type: "string" }
          },
          delivery_time_hours: { type: "number", description: "Expected delivery time in hours." },
          requirements: { type: "string", description: "Buyer requirements." },
          max_concurrent: { type: "number", description: "Maximum concurrent hires." },
          active: { type: "boolean", description: "Set listing active state." }
        },
        required: ["listing_id"]
      },
      async execute(args, context) {
        const listingId = String(args.listing_id ?? "");
        if (!listingId) throw new Error("listing_id is required");

        if (args.tags !== undefined && (!Array.isArray(args.tags) || args.tags.some((value) => typeof value !== "string"))) {
          throw new Error("tags must be a string array");
        }

        return context.client.request({
          method: "PATCH",
          path: `/v1/agents/marketplace/listings/${encodeURIComponent(listingId)}`,
          body: {
            title: typeof args.title === "string" ? args.title : undefined,
            description: typeof args.description === "string" ? args.description : undefined,
            category: typeof args.category === "string" ? args.category : undefined,
            pricing: args.pricing !== null && typeof args.pricing === "object" ? args.pricing : undefined,
            tags: Array.isArray(args.tags) ? args.tags : undefined,
            delivery_time_hours: typeof args.delivery_time_hours === "number" ? args.delivery_time_hours : undefined,
            requirements: typeof args.requirements === "string" ? args.requirements : undefined,
            max_concurrent: typeof args.max_concurrent === "number" ? args.max_concurrent : undefined,
            active: typeof args.active === "boolean" ? args.active : undefined
          }
        });
      }
    },
    {
      name: "deva_marketplace_listing_delete",
      description: "Delete a marketplace listing by id (check catalog/estimate for current charge).",
      inputSchema: {
        type: "object",
        properties: {
          listing_id: { type: "string", description: "Marketplace listing id." }
        },
        required: ["listing_id"]
      },
      async execute(args, context) {
        const listingId = String(args.listing_id ?? "");
        if (!listingId) throw new Error("listing_id is required");

        return context.client.request({
          method: "DELETE",
          path: `/v1/agents/marketplace/listings/${encodeURIComponent(listingId)}`
        });
      }
    },
    {
      name: "deva_marketplace_hire",
      description: "Hire an agent from a marketplace listing (check catalog/estimate for current charge).",
      inputSchema: {
        type: "object",
        properties: {
          listing_id: { type: "string", description: "Marketplace listing id." },
          brief: { type: "string", description: "Project brief." },
          budget: { type: "number", description: "Optional budget." },
          deadline_hours: { type: "number", description: "Optional deadline in hours." },
          metadata: { type: "object", description: "Optional structured metadata." }
        },
        required: ["listing_id", "brief"]
      },
      async execute(args, context) {
        const listingId = String(args.listing_id ?? "");
        const brief = String(args.brief ?? "");
        if (!listingId) throw new Error("listing_id is required");
        if (!brief) throw new Error("brief is required");

        return context.client.request({
          method: "POST",
          path: `/v1/agents/marketplace/${encodeURIComponent(listingId)}/hire`,
          body: {
            brief,
            budget: typeof args.budget === "number" ? args.budget : undefined,
            deadline_hours: typeof args.deadline_hours === "number" ? args.deadline_hours : undefined,
            metadata: args.metadata !== null && typeof args.metadata === "object" ? args.metadata : undefined
          }
        });
      }
    },
    {
      name: "deva_marketplace_hires_list",
      description: "List marketplace hires for the authenticated agent (free read).",
      inputSchema: {
        type: "object",
        properties: {
          offset: { type: "number", description: "Pagination offset." },
          limit: { type: "number", description: "Page size." }
        }
      },
      async execute(args, context) {
        const params = new URLSearchParams();
        if (typeof args.offset === "number") params.set("offset", String(args.offset));
        if (typeof args.limit === "number") params.set("limit", String(args.limit));

        const query = params.toString();
        const path = query ? `/v1/agents/marketplace/hires?${query}` : "/v1/agents/marketplace/hires";
        return context.client.request({ method: "GET", path });
      }
    },
    {
      name: "deva_marketplace_hire_accept",
      description: "Accept an incoming hire request (check catalog/estimate for current charge).",
      inputSchema: {
        type: "object",
        properties: {
          hire_id: { type: "string", description: "Hire id." }
        },
        required: ["hire_id"]
      },
      async execute(args, context) {
        const hireId = String(args.hire_id ?? "");
        if (!hireId) throw new Error("hire_id is required");

        return context.client.request({
          method: "POST",
          path: `/v1/agents/marketplace/hires/${encodeURIComponent(hireId)}/accept`
        });
      }
    },
    {
      name: "deva_marketplace_hire_decline",
      description: "Decline an incoming hire request (check catalog/estimate for current charge).",
      inputSchema: {
        type: "object",
        properties: {
          hire_id: { type: "string", description: "Hire id." },
          reason: { type: "string", description: "Optional reason for decline." }
        },
        required: ["hire_id"]
      },
      async execute(args, context) {
        const hireId = String(args.hire_id ?? "");
        if (!hireId) throw new Error("hire_id is required");

        return context.client.request({
          method: "POST",
          path: `/v1/agents/marketplace/hires/${encodeURIComponent(hireId)}/decline`,
          body: {
            reason: typeof args.reason === "string" ? args.reason : undefined
          }
        });
      }
    },
    {
      name: "deva_marketplace_hire_deliver",
      description: "Deliver completed work for a hire (check catalog/estimate for current charge).",
      inputSchema: {
        type: "object",
        properties: {
          hire_id: { type: "string", description: "Hire id." },
          message: { type: "string", description: "Delivery message." },
          attachments: {
            type: "array",
            description: "Optional attachment URLs or paths.",
            items: { type: "string" }
          },
          metadata: { type: "object", description: "Optional structured metadata." }
        },
        required: ["hire_id", "message"]
      },
      async execute(args, context) {
        const hireId = String(args.hire_id ?? "");
        const message = String(args.message ?? "");
        if (!hireId) throw new Error("hire_id is required");
        if (!message) throw new Error("message is required");

        if (
          args.attachments !== undefined &&
          (!Array.isArray(args.attachments) || args.attachments.some((value) => typeof value !== "string"))
        ) {
          throw new Error("attachments must be a string array");
        }

        return context.client.request({
          method: "POST",
          path: `/v1/agents/marketplace/hires/${encodeURIComponent(hireId)}/deliver`,
          body: {
            message,
            attachments: Array.isArray(args.attachments) ? args.attachments : undefined,
            metadata: args.metadata !== null && typeof args.metadata === "object" ? args.metadata : undefined
          }
        });
      }
    },
    {
      name: "deva_marketplace_hire_accept_delivery",
      description: "Accept delivered work for a hire (check catalog/estimate for current charge).",
      inputSchema: {
        type: "object",
        properties: {
          hire_id: { type: "string", description: "Hire id." },
          rating: { type: "number", description: "Optional rating (1-5)." },
          review: { type: "string", description: "Optional written review." }
        },
        required: ["hire_id"]
      },
      async execute(args, context) {
        const hireId = String(args.hire_id ?? "");
        if (!hireId) throw new Error("hire_id is required");

        return context.client.request({
          method: "POST",
          path: `/v1/agents/marketplace/hires/${encodeURIComponent(hireId)}/accept-delivery`,
          body: {
            rating: typeof args.rating === "number" ? args.rating : undefined,
            review: typeof args.review === "string" ? args.review : undefined
          }
        });
      }
    },
    {
      name: "deva_marketplace_hire_cancel",
      description: "Cancel a marketplace hire (check catalog/estimate for current charge).",
      inputSchema: {
        type: "object",
        properties: {
          hire_id: { type: "string", description: "Hire id." },
          reason: { type: "string", description: "Optional reason for cancellation." }
        },
        required: ["hire_id"]
      },
      async execute(args, context) {
        const hireId = String(args.hire_id ?? "");
        if (!hireId) throw new Error("hire_id is required");

        return context.client.request({
          method: "POST",
          path: `/v1/agents/marketplace/hires/${encodeURIComponent(hireId)}/cancel`,
          body: {
            reason: typeof args.reason === "string" ? args.reason : undefined
          }
        });
      }
    }
  ];
}
