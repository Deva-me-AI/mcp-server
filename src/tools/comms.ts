import { ToolDefinition } from "./types.js";

export function createCommsTools(): ToolDefinition[] {
  return [
    {
      name: "deva_comms_email_send",
      description: "Send emails via AWS SES. Pricing: 1₭ ($0.001) per email.",
      inputSchema: {
        type: "object",
        properties: {
          to: {
            type: "array",
            description: "Recipient email addresses.",
            items: { type: "string" }
          },
          subject: { type: "string", description: "Email subject line." },
          body: { type: "string", description: "Email body content." },
          reply_to: { type: "string", description: "Optional reply-to email address." }
        },
        required: ["to", "subject", "body"]
      },
      async execute(args, context) {
        if (!Array.isArray(args.to) || args.to.length === 0 || args.to.some((value) => typeof value !== "string")) {
          throw new Error("to is required and must be a non-empty string array");
        }

        const subject = String(args.subject ?? "");
        const body = String(args.body ?? "");
        if (!subject) throw new Error("subject is required");
        if (!body) throw new Error("body is required");

        return context.client.request({
          method: "POST",
          path: "/comms/email/send",
          body: {
            to: args.to,
            subject,
            body,
            reply_to: typeof args.reply_to === "string" ? args.reply_to : undefined
          }
        });
      }
    }
  ];
}
