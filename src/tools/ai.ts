import { ToolDefinition } from "./types.js";

export function createAiTools(): ToolDefinition[] {
  return [
    {
      name: "deva_ai_tts",
      description: "Generate text-to-speech audio. Pricing: 1₭ ($0.001) per 100 chars.",
      inputSchema: {
        type: "object",
        description: "TTS payload accepted by Deva API.",
        additionalProperties: true
      },
      async execute(args, context) {
        return context.client.request({ method: "POST", path: "/v1/ai/tts", body: args });
      }
    },
    {
      name: "deva_ai_image_generate",
      description: "Generate image content. Pricing: 80₭ ($0.08) standard or 160₭ ($0.16) HD per image.",
      inputSchema: {
        type: "object",
        description: "Image generation payload accepted by Deva API.",
        additionalProperties: true
      },
      async execute(args, context) {
        return context.client.request({ method: "POST", path: "/v1/agents/resources/images/generate", body: args });
      }
    },
    {
      name: "deva_ai_embeddings",
      description: "Create embeddings for input text. Pricing: 1₭ ($0.001) per 1K tokens.",
      inputSchema: {
        type: "object",
        description: "Embeddings payload accepted by Deva API.",
        additionalProperties: true
      },
      async execute(args, context) {
        return context.client.request({ method: "POST", path: "/v1/agents/resources/embeddings", body: args });
      }
    },
    {
      name: "deva_ai_vision_analyze",
      description: "Analyze image/video content using vision models. Pricing: 20₭ ($0.02) per image.",
      inputSchema: {
        type: "object",
        description: "Vision payload accepted by Deva API.",
        additionalProperties: true
      },
      async execute(args, context) {
        return context.client.request({ method: "POST", path: "/v1/agents/resources/vision/analyze", body: args });
      }
    },
    {
      name: "deva_ai_web_search",
      description: "Run Deva web search resource. Pricing: 10₭ ($0.01) per search.",
      inputSchema: {
        type: "object",
        description: "Search payload accepted by Deva API.",
        additionalProperties: true
      },
      async execute(args, context) {
        return context.client.request({ method: "POST", path: "/v1/agents/resources/search", body: args });
      }
    },
    {
      name: "deva_ai_llm_completion",
      description:
        "Send chat completion requests via OpenRouter. Supports all major LLM models. Pricing: dynamic, about 20₭ ($0.02) base and ~2x OpenRouter cost.",
      inputSchema: {
        type: "object",
        properties: {
          model: { type: "string", description: "LLM model identifier (for example openai/gpt-4o-mini)." },
          messages: {
            type: "array",
            description: "Chat messages in OpenAI-compatible format.",
            items: {
              type: "object",
              properties: {
                role: { type: "string", description: "Message role (system, user, assistant)." },
                content: { type: "string", description: "Message content." }
              },
              required: ["role", "content"]
            }
          },
          max_tokens: { type: "number", description: "Maximum output tokens." },
          temperature: { type: "number", description: "Sampling temperature." }
        },
        required: ["model", "messages"]
      },
      async execute(args, context) {
        const model = String(args.model ?? "");
        if (!model) throw new Error("model is required");
        if (!Array.isArray(args.messages) || args.messages.length === 0) {
          throw new Error("messages is required");
        }

        return context.client.request({
          method: "POST",
          path: "/chat/completions",
          body: {
            model,
            messages: args.messages,
            max_tokens: typeof args.max_tokens === "number" ? args.max_tokens : undefined,
            temperature: typeof args.temperature === "number" ? args.temperature : undefined
          }
        });
      }
    },
    {
      name: "deva_ai_transcription",
      description: "Transcribe audio using Groq Whisper. Supports mp3, wav, m4a, webm. Pricing: 5₭ ($0.005) per 24s audio.",
      inputSchema: {
        type: "object",
        properties: {
          audio_url: { type: "string", description: "URL to an audio file to transcribe." },
          language: { type: "string", description: "Optional language hint." }
        },
        required: ["audio_url"]
      },
      async execute(args, context) {
        const audioUrl = String(args.audio_url ?? "");
        if (!audioUrl) throw new Error("audio_url is required");

        return context.client.request({
          method: "POST",
          path: "/ai/transcribe",
          body: {
            audio_url: audioUrl,
            language: typeof args.language === "string" ? args.language : undefined
          }
        });
      }
    }
  ];
}
