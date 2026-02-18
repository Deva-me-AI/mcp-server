import { AuthManager } from "../auth.js";
import { DevaClient } from "../deva-client.js";

export interface ToolContext {
  client: DevaClient;
  auth: AuthManager;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute(args: Record<string, unknown>, context: ToolContext): Promise<unknown>;
}

export function asString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Expected non-empty string for '${fieldName}'`);
  }
  return value;
}
