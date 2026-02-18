import { ToolDefinition } from "./types.js";

export function createCronTools(): ToolDefinition[] {
  return [
    {
      name: "deva_cron_create",
      description: "Create a scheduled cron or interval job for your agent (check catalog/estimate for current charge).",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Job name." },
          schedule: {
            type: "object",
            description: "Schedule config.",
            properties: {
              type: { type: "string", enum: ["cron", "interval"] },
              expression: { type: "string", description: "Cron expression when type=cron." },
              interval_minutes: { type: "number", description: "Interval minutes when type=interval." },
              timezone: { type: "string", description: "Optional timezone identifier." }
            },
            required: ["type"]
          },
          task: {
            type: "object",
            description: "Task request to execute.",
            properties: {
              method: { type: "string", enum: ["GET", "POST", "PUT", "PATCH", "DELETE"] },
              endpoint: { type: "string", description: "API endpoint path to call." },
              body: { type: "object", description: "Optional request body." },
              headers: { type: "object", description: "Optional request headers." }
            },
            required: ["method", "endpoint"]
          },
          enabled: { type: "boolean", description: "Enable job immediately." },
          max_retries: { type: "number", description: "Maximum retries (0-3)." },
          timeout_seconds: { type: "number", description: "Task timeout in seconds (5-300)." },
          description: { type: "string", description: "Optional job description." }
        },
        required: ["name", "schedule", "task"]
      },
      async execute(args, context) {
        const name = String(args.name ?? "");
        if (!name) throw new Error("name is required");

        if (args.schedule === null || typeof args.schedule !== "object") {
          throw new Error("schedule is required");
        }

        if (args.task === null || typeof args.task !== "object") {
          throw new Error("task is required");
        }

        return context.client.request({
          method: "POST",
          path: "/v1/agents/cron",
          body: {
            name,
            schedule: args.schedule,
            task: args.task,
            enabled: typeof args.enabled === "boolean" ? args.enabled : undefined,
            max_retries: typeof args.max_retries === "number" ? args.max_retries : undefined,
            timeout_seconds: typeof args.timeout_seconds === "number" ? args.timeout_seconds : undefined,
            description: typeof args.description === "string" ? args.description : undefined
          }
        });
      }
    },
    {
      name: "deva_cron_list",
      description: "List cron jobs for the authenticated agent (free read).",
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
        const path = query ? `/v1/agents/cron?${query}` : "/v1/agents/cron";
        return context.client.request({ method: "GET", path });
      }
    },
    {
      name: "deva_cron_update",
      description: "Update a cron job by id (check catalog/estimate for current charge).",
      inputSchema: {
        type: "object",
        properties: {
          job_id: { type: "string", description: "Cron job id." },
          name: { type: "string", description: "Job name." },
          schedule: { type: "object", description: "Schedule config." },
          task: { type: "object", description: "Task request to execute." },
          enabled: { type: "boolean", description: "Enable or disable job." },
          max_retries: { type: "number", description: "Maximum retries (0-3)." },
          timeout_seconds: { type: "number", description: "Task timeout in seconds (5-300)." },
          description: { type: "string", description: "Optional job description." }
        },
        required: ["job_id"]
      },
      async execute(args, context) {
        const jobId = String(args.job_id ?? "");
        if (!jobId) throw new Error("job_id is required");

        return context.client.request({
          method: "PATCH",
          path: `/v1/agents/cron/${encodeURIComponent(jobId)}`,
          body: {
            name: typeof args.name === "string" ? args.name : undefined,
            schedule: args.schedule !== null && typeof args.schedule === "object" ? args.schedule : undefined,
            task: args.task !== null && typeof args.task === "object" ? args.task : undefined,
            enabled: typeof args.enabled === "boolean" ? args.enabled : undefined,
            max_retries: typeof args.max_retries === "number" ? args.max_retries : undefined,
            timeout_seconds: typeof args.timeout_seconds === "number" ? args.timeout_seconds : undefined,
            description: typeof args.description === "string" ? args.description : undefined
          }
        });
      }
    },
    {
      name: "deva_cron_delete",
      description: "Delete a cron job by id (check catalog/estimate for current charge).",
      inputSchema: {
        type: "object",
        properties: {
          job_id: { type: "string", description: "Cron job id." }
        },
        required: ["job_id"]
      },
      async execute(args, context) {
        const jobId = String(args.job_id ?? "");
        if (!jobId) throw new Error("job_id is required");

        return context.client.request({ method: "DELETE", path: `/v1/agents/cron/${encodeURIComponent(jobId)}` });
      }
    },
    {
      name: "deva_cron_runs",
      description: "List execution runs for a cron job (free read).",
      inputSchema: {
        type: "object",
        properties: {
          job_id: { type: "string", description: "Cron job id." },
          offset: { type: "number", description: "Pagination offset." },
          limit: { type: "number", description: "Page size." }
        },
        required: ["job_id"]
      },
      async execute(args, context) {
        const jobId = String(args.job_id ?? "");
        if (!jobId) throw new Error("job_id is required");

        const params = new URLSearchParams();
        if (typeof args.offset === "number") params.set("offset", String(args.offset));
        if (typeof args.limit === "number") params.set("limit", String(args.limit));

        const query = params.toString();
        const path = query
          ? `/v1/agents/cron/${encodeURIComponent(jobId)}/runs?${query}`
          : `/v1/agents/cron/${encodeURIComponent(jobId)}/runs`;
        return context.client.request({ method: "GET", path });
      }
    }
  ];
}
