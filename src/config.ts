import { randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildDefaultToolPolicyConfig, normalizeToolPolicyConfig } from "./tool-policy.js";
import type { ToolPolicyConfig } from "./tool-policy.js";

export type LogLevel = "error" | "warn" | "info" | "debug";

export interface AgentProfileConfig {
  name?: string;
  api_key?: string;
  /**
   * Registration recovery ids sent to `POST /v1/agents/register`, keyed by lowercased agent
   * name. Secret: together with the agent name a client_id can mint a new key for an
   * unclaimed agent. Stored here (0600) so a lost register response can be recovered by
   * retrying with the same name.
   */
  client_ids?: Record<string, string>;
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

/**
 * Writes the config atomically (temp file + rename) with mode 0600. The explicit chmod also
 * tightens files created earlier with looser permissions, since `mode` only applies on create.
 */
export async function saveConfigFile(configPath: string, config: DevaMcpConfigFile): Promise<void> {
  await mkdir(path.dirname(configPath), { recursive: true, mode: 0o700 });
  const tmpPath = `${configPath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(tmpPath, JSON.stringify(config, null, 2), { mode: 0o600 });
    await chmod(tmpPath, 0o600);
    await rename(tmpPath, configPath);
  } catch (error) {
    await rm(tmpPath, { force: true });
    throw error;
  }
  await chmod(configPath, 0o600);
}

/**
 * Applies `mutate` to a copy of the config file, persists it, and only then adopts it in
 * memory. A failed write throws and leaves the in-memory state untouched, so the next call
 * still sees the change as unsaved and retries the write instead of skipping it.
 */
async function updateConfigFile(config: RuntimeConfig, mutate: (file: DevaMcpConfigFile) => void): Promise<void> {
  const next = structuredClone(config.configFile);
  mutate(next);
  await saveConfigFile(config.configPath, next);
  config.configFile = next;
}

function profileOf(file: DevaMcpConfigFile, profile: string): AgentProfileConfig {
  file.agents[profile] ??= {};
  return file.agents[profile];
}

export async function saveApiKey(config: RuntimeConfig, apiKey: string, name?: string): Promise<void> {
  await updateConfigFile(config, (file) => {
    file.profile = config.profile;
    const profile = profileOf(file, config.profile);
    profile.api_key = apiKey;
    if (name) {
      profile.name = name;
    }
  });
}

/**
 * Returns the persisted register client_id for `agentName` in the active profile, generating
 * one if none exists (or adopting the caller-supplied one). Ids are keyed by agent name so
 * registering a second agent never reuses or overwrites another agent's recovery id. It is
 * written to disk BEFORE the register request so a crash or lost response can be recovered.
 */
export async function ensureClientId(config: RuntimeConfig, agentName: string, provided?: string): Promise<string> {
  const key = agentName.toLowerCase();
  const stored = config.configFile.agents[config.profile]?.client_ids?.[key];
  const clientId = provided ?? stored ?? randomUUID();
  if (stored !== clientId) {
    await updateConfigFile(config, (file) => {
      file.profile = config.profile;
      const profile = profileOf(file, config.profile);
      profile.client_ids = { ...profile.client_ids, [key]: clientId };
    });
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
