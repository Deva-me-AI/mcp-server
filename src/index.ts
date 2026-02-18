#!/usr/bin/env node
import { loadConfig } from "./config.js";
import { DevaMcpServer } from "./server.js";

async function main(): Promise<void> {
  const config = await loadConfig();
  const server = new DevaMcpServer(config);
  await server.start();
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "Unknown startup error";
  process.stderr.write(`[deva-mcp:error] ${message}\n`);
  process.exit(1);
});
