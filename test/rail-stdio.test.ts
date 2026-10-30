import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { expect, it } from "vitest";

it.skipIf(!process.env.RAIL_STDIO_SMOKE)("compiled stdio lists exactly the three default rail tools", async () => {
  const directory = await mkdtemp(join(tmpdir(), "rail-stdio-"));
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["dist/index.js"],
    env: { PATH: process.env.PATH ?? "", DEVA_MCP_CONFIG_PATH: join(directory, "config.json") },
    stderr: "pipe"
  });
  const client = new Client({ name: "rail-smoke", version: "1.0.0" });
  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    expect(tools.filter(tool => tool.name.startsWith("deva_tools_")).map(tool => tool.name)).toEqual([
      "deva_tools_discover", "deva_tools_inspect", "deva_tools_estimate"
    ]);
  } finally {
    await client.close();
    await transport.close();
    await rm(directory, { recursive: true, force: true });
  }
});
