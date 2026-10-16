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
          body_text: { type: "string", description: "Plain-text body (body_text or body_html required)." },
          body_html: { type: "string", description: "HTML body (body_text or body_html required)." },
          body: { type: "string", description: "Deprecated alias for body_text." },
          reply_to: { type: "string", description: "Optional reply-to email address." }
        },
        required: ["to", "subject"]
      },
      async execute(args, context) {
        if (!Array.isArray(args.to) || args.to.length === 0 || args.to.some((value) => typeof value !== "string")) {
          throw new Error("to is required and must be a non-empty string array");
        }

        const subject = String(args.subject ?? "");
        const bodyText =
          typeof args.body_text === "string" && args.body_text ? args.body_text : typeof args.body === "string" && args.body ? args.body : undefined;
        const bodyHtml = typeof args.body_html === "string" && args.body_html ? args.body_html : undefined;
        if (!subject) throw new Error("subject is required");
        if (!bodyText && !bodyHtml) throw new Error("body_text or body_html is required");

        return context.client.request({
          method: "POST",
          path: "/v1/comms/email/send",
          body: {
            to: args.to,
            subject,
            body_text: bodyText,
            body_html: bodyHtml,
            reply_to: typeof args.reply_to === "string" ? args.reply_to : undefined
          }
        });
      }
    }
  ];
}
