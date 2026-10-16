import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildDefaultToolPolicyConfig, normalizeToolPolicyConfig } from "./tool-policy.js";
import type { ToolPolicyConfig } from "./tool-policy.js";

export type LogLevel = "error" | "warn" | "info" | "debug";

export interface AgentProfileConfig {
  name?: string;
  api_key?: string;
  /**
   * Registration recovery id sent to `POST /v1/agents/register`. Secret: together with the
   * agent name it can mint a new key for an unclaimed agent. Stored here (0600) so a lost
   * register response can be recovered by retrying with the same name + client_id.
   */
  client_id?: string;
}

export interface DevaMcpConfigFile {
  profile: string;
  api_base: string;
  agents: Record<string, AgentProfileConfig>;
  defaults: {
    timeout_ms: number;
  };
  tool_policy: ToolPolicyConfig;
}

export interface RuntimeConfig {
  apiBase: string;
  profile: string;
  apiKey?: string;
  timeoutMs: number;
  logLevel: LogLevel;
  configPath: string;
  configFile: DevaMcpConfigFile;
  toolPolicy: ToolPolicyConfig;
}

const DEFAULT_API_BASE = "https://api.deva.me";
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_PROFILE = "default";
const DEFAULT_LOG_LEVEL: LogLevel = "info";

function parseLogLevel(value: string | undefined): LogLevel {
  if (value === "error" || value === "warn" || value === "info" || value === "debug") {
    return value;
  }
  return DEFAULT_LOG_LEVEL;
}

function resolveConfigPath(): string {
  const fromEnv = process.env.DEVA_MCP_CONFIG_PATH;
  if (fromEnv && fromEnv.trim().length > 0) {
    return fromEnv;
  }

  return path.join(os.homedir(), ".deva-mcp", "config.json");
}

function buildDefaultFile(): DevaMcpConfigFile {
  return {
    profile: DEFAULT_PROFILE,
    api_base: DEFAULT_API_BASE,
    agents: {
      [DEFAULT_PROFILE]: {}
    },
    defaults: {
      timeout_ms: DEFAULT_TIMEOUT_MS
    },
    tool_policy: buildDefaultToolPolicyConfig()
  };
}

export async function loadConfig(): Promise<RuntimeConfig> {
  const configPath = resolveConfigPath();
  let fileConfig = buildDefaultFile();

  try {
    const raw = await readFile(configPath, "utf8");
    const parsed = JSON.parse(raw) as Partial<DevaMcpConfigFile>;

    fileConfig = {
      profile: parsed.profile ?? DEFAULT_PROFILE,
      api_base: parsed.api_base ?? DEFAULT_API_BASE,
      agents: parsed.agents ?? { [DEFAULT_PROFILE]: {} },
      defaults: {
        timeout_ms: parsed.defaults?.timeout_ms ?? DEFAULT_TIMEOUT_MS
      },
      tool_policy: normalizeToolPolicyConfig(parsed.tool_policy)
    };
  } catch {
    await saveConfigFile(configPath, fileConfig);
  }

  const profile = process.env.DEVA_MCP_PROFILE ?? fileConfig.profile ?? DEFAULT_PROFILE;
  const apiBase = process.env.DEVA_API_BASE ?? fileConfig.api_base ?? DEFAULT_API_BASE;
  const timeoutMs = Number(process.env.DEVA_MCP_TIMEOUT_MS ?? fileConfig.defaults.timeout_ms ?? DEFAULT_TIMEOUT_MS);
  const logLevel = parseLogLevel(process.env.DEVA_MCP_LOG_LEVEL);

  const profileData = fileConfig.agents[profile] ?? {};
  const apiKey = process.env.DEVA_API_KEY ?? profileData.api_key;

  if (!fileConfig.agents[profile]) {
    fileConfig.agents[profile] = {};
  }

  return {
    apiBase,
    profile,
    apiKey,
    timeoutMs,
    logLevel,
    configPath,
    configFile: fileConfig,
    toolPolicy: fileConfig.tool_policy
  };
}

export async function saveConfigFile(configPath: string, config: DevaMcpConfigFile): Promise<void> {
  await mkdir(path.dirname(configPath), { recursive: true });
  await writeFile(configPath, JSON.stringify(config, null, 2), { mode: 0o600 });
}

export async function saveApiKey(config: RuntimeConfig, apiKey: string, name?: string): Promise<void> {
  config.configFile.profile = config.profile;
  if (!config.configFile.agents[config.profile]) {
    config.configFile.agents[config.profile] = {};
  }

  config.configFile.agents[config.profile].api_key = apiKey;
  if (name) {
    config.configFile.agents[config.profile].name = name;
  }

  await saveConfigFile(config.configPath, config.configFile);
}

/**
 * Returns the persisted register client_id for the active profile, generating and saving
 * one first if none exists (or saving the caller-supplied one). It is written to disk BEFORE
 * the register request so a crash or lost response can be recovered on retry.
 */
export async function ensureClientId(config: RuntimeConfig, provided?: string): Promise<string> {
  if (!config.configFile.agents[config.profile]) {
    config.configFile.agents[config.profile] = {};
  }
  const profile = config.configFile.agents[config.profile];
  const clientId = provided ?? profile.client_id ?? randomUUID();
  if (profile.client_id !== clientId) {
    profile.client_id = clientId;
    config.configFile.profile = config.profile;
    await saveConfigFile(config.configPath, config.configFile);
  }
  return clientId;
}

export function redactApiKey(value: string | undefined): string {
  if (!value) {
    return "<none>";
  }

  if (value.length <= 8) {
    return "****";
  }

  return `${value.slice(0, 5)}***${value.slice(-3)}`;
}
