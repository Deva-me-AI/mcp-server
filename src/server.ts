import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { AuthManager } from "./auth.js";
import { withKarmaCost } from "./billing.js";
import { RuntimeConfig, redactApiKey } from "./config.js";
import { DevaClient } from "./deva-client.js";
import { formatErrorForTool } from "./errors.js";
import { createAgentTools } from "./tools/agent.js";
import { createAiTools } from "./tools/ai.js";
import { createBalanceTools } from "./tools/balance.js";
import { createCapabilityTools } from "./tools/capabilities.js";
import { createCommsTools } from "./tools/comms.js";
import { createCronTools } from "./tools/cron.js";
import { createGovernanceTools } from "./tools/governance.js";
import { createMarketplaceTools } from "./tools/marketplace.js";
import { createMessagingTools } from "./tools/messaging.js";
import { createServerTools } from "./tools/servers.js";
import { createSocialTools } from "./tools/social.js";
import { createStorageTools } from "./tools/storage.js";
import { createWebhookTools } from "./tools/webhooks.js";
import { createWalletTools } from "./tools/wallet.js";
import { ToolContext, ToolDefinition } from "./tools/types.js";

const LOG_LEVEL_ORDER: Record<RuntimeConfig["logLevel"], number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3
};

export class DevaMcpServer {
  private readonly mcpServer: Server;
  private readonly client: DevaClient;
  private readonly auth: AuthManager;
  private readonly tools: ToolDefinition[];

  constructor(private readonly config: RuntimeConfig) {
    this.client = new DevaClient(config, () => this.config.apiKey);
    this.auth = new AuthManager(config, this.client);

    this.tools = [
      ...createAgentTools(),
      ...createSocialTools(),
      ...createAiTools(),
      ...createStorageTools(),
      ...createBalanceTools(),
      ...createMessagingTools(),
      ...createCommsTools(),
      ...createWalletTools(),
      ...createGovernanceTools(),
      ...createWebhookTools(),
      ...createCapabilityTools(),
      ...createCronTools(),
      ...createMarketplaceTools(),
      ...createServerTools()
    ];

    this.mcpServer = new Server(
      {
        name: "@deva/mcp-server",
        version: "0.1.0"
      },
      {
        capabilities: {
          tools: {}
        }
      }
    );

    this.registerHandlers();
  }

  private log(level: RuntimeConfig["logLevel"], message: string): void {
    if (LOG_LEVEL_ORDER[level] <= LOG_LEVEL_ORDER[this.config.logLevel]) {
      process.stderr.write(`[deva-mcp:${level}] ${message}\n`);
    }
  }

  private registerHandlers(): void {
    this.mcpServer.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: this.tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema
        }))
      };
    });

    this.mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
      const toolName = request.params.name;
      const tool = this.tools.find((candidate) => candidate.name === toolName);

      if (!tool) {
        return {
          isError: true,
          content: [{ type: "text", text: `Unknown tool: ${toolName}` }]
        };
      }

      try {
        const args = (request.params.arguments ?? {}) as Record<string, unknown>;
        const context: ToolContext = {
          client: this.client,
          auth: this.auth
        };

        const payload = await tool.execute(args, context);
        const decorated = payload && typeof payload === "object" ? withKarmaCost(payload as Record<string, unknown>) : payload;

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(decorated, null, 2)
            }
          ]
        };
      } catch (error) {
        const message = formatErrorForTool(error);
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: message
            }
          ]
        };
      }
    });
  }

  async start(): Promise<void> {
    this.log("info", `starting profile=${this.config.profile} api_base=${this.config.apiBase}`);
    this.log("debug", `api_key=${redactApiKey(this.config.apiKey)}`);

    const transport = new StdioServerTransport();
    await this.mcpServer.connect(transport);

    this.log("info", "server connected over stdio");
  }
}
