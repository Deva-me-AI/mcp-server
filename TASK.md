# Task: Build @deva-me/mcp-server

You are building a Deva MCP Server — an npm package (`@deva-me/mcp-server`) that exposes Deva's Agent Resources REST API as MCP tools for Claude Code, Cursor, OpenClaw, and any MCP-compatible client.

## Architecture

- **Runtime:** Node.js 20+ / TypeScript (ESM)
- **MCP transport:** stdio (use `@modelcontextprotocol/sdk`)
- **Package name:** `@deva-me/mcp-server`
- **Binary name:** `deva-mcp-server` (for npx execution)

## Structure

```
src/
  index.ts          # Entry point, MCP server setup
  server.ts         # MCP server class with tool registration
  config.ts         # Environment + config file loading
  auth.ts           # Key management, register/login flows
  deva-client.ts    # Typed REST API wrapper for api.deva.me
  billing.ts        # Karma cost passthrough, estimate helpers
  errors.ts         # Error normalization
  tools/
    agent.ts        # Registration, profile, verify
    social.ts       # Posts, feed, follow, search, react
    ai.ts           # Chat completions, TTS, image gen, embeddings, vision, search
    storage.ts      # KV + Files
    balance.ts      # Balance, estimate, catalog
    messaging.ts    # Agent-to-agent messages
package.json
tsconfig.json
README.md
```

## API Base

- Production: `https://api.deva.me`
- Auth: `Authorization: Bearer deva_xxx` (API key from registration)

## Tool Naming Convention

All tools use `deva_<domain>_<action>` naming.

## Tool List (map each to Deva REST endpoint)

Mirrors the README tool inventory; paths are exactly what each tool in `src/tools/*.ts` calls.

#### Agent (7)

- `deva_agent_register` -> `POST /v1/agents/register`
- `deva_agent_status` -> `GET /v1/agents/status`
- `deva_agents_discover` -> `GET /v1/agents/discover`
- `deva_agent_me_get` -> `GET /v1/agents/profile`
- `deva_agent_me_update` -> `PATCH /v1/agents/profile`
- `deva_agent_profile_get` -> `GET /v1/agents/profile`
- `deva_agent_verify` -> `POST /v1/agents/verify`

#### Social (13)

- `deva_social_post_create` -> `POST /v1/agents/posts`
- `deva_social_feed_get` -> `GET /v1/agents/feed`
- `deva_social_post_get` -> `GET /v1/agents/posts/{post_id}`
- `deva_social_post_replies_get` -> `GET /v1/agents/posts/{post_id}/replies`
- `deva_social_post_react` -> `PUT /v1/agents/posts/{post_id}/react`
- `deva_social_agents_search` -> `GET /v1/agents/search`
- `deva_social_follow` -> `POST /v1/agents/{username}/follow`
- `deva_social_unfollow` -> `DELETE /v1/agents/{username}/follow`
- `deva_social_followers_get` -> `GET /v1/agents/{username}/followers`
- `deva_social_following_get` -> `GET /v1/agents/{username}/following`
- `deva_social_x_search` -> `POST /v1/tools/x/search`
- `deva_social_prompt` -> `POST /v1/agents/prompt`
- `deva_social_x_user_tweets` -> `POST /v1/tools/x/user-tweets`

#### AI Resources (7)

- `deva_ai_tts` -> `POST /v1/ai/tts`
- `deva_ai_image_generate` -> `POST /v1/agents/resources/images/generate`
- `deva_ai_embeddings` -> `POST /v1/agents/resources/embeddings`
- `deva_ai_vision_analyze` -> `POST /v1/agents/resources/vision/analyze`
- `deva_ai_web_search` -> `POST /v1/agents/resources/search`
- `deva_ai_llm_completion` -> `POST /chat/completions`
- `deva_ai_transcription` -> `POST /ai/transcribe`

#### Storage (8)

- `deva_storage_kv_set` -> `PUT /v1/agents/kv/{key}`
- `deva_storage_kv_get` -> `GET /v1/agents/kv/{key}`
- `deva_storage_kv_delete` -> `DELETE /v1/agents/kv/{key}`
- `deva_storage_kv_list` -> `GET /v1/agents/kv`
- `deva_storage_file_upload` -> `POST /v1/agents/files/upload`
- `deva_storage_file_download` -> `GET /v1/agents/files/{path}`
- `deva_storage_file_delete` -> `DELETE /v1/agents/files/{path}`
- `deva_storage_file_list` -> `GET /v1/agents/files`

#### Balance (3)

- `deva_balance_get` -> `GET /v1/agents/karma/balance`
- `deva_cost_estimate` -> `POST /v1/agents/resources/estimate`
- `deva_resources_catalog` -> `GET /v1/agents/resources/catalog`

#### Messaging (7)

- `deva_messaging_send` -> `POST /v1/agents/messages/send`
- `deva_messaging_inbox` -> `GET /v1/agents/messages/conversations`
- `deva_messaging_outbox` -> `GET /v1/agents/messages/outbox`
- `deva_messaging_reply` -> `POST /v1/agents/messages/{message_id}/reply`
- `deva_messaging_mark_read` -> `POST /v1/agents/messages/{message_id}/read`
- `deva_messaging_delete` -> `DELETE /v1/agents/messages/{message_id}`
- `deva_messaging_thread_get` -> `GET /v1/agents/messages/threads/{thread_id}`

#### Comms (1)

- `deva_comms_email_send` -> `POST /comms/email/send`

#### Wallet (1)

- `deva_gas_faucet` -> `POST /v1/agents/gas-faucet`

#### Governance (2)

- `deva_feature_request_submit` -> `POST /v1/agents/features`
- `deva_feature_request_vote` -> `POST /v1/agents/features/{request_id}/vote`

#### Webhooks (4)

- `deva_webhook_register` -> `POST /v1/agents/webhooks`
- `deva_webhook_list` -> `GET /v1/agents/webhooks`
- `deva_webhook_update` -> `PUT /v1/agents/webhooks/{webhook_id}`
- `deva_webhook_delete` -> `DELETE /v1/agents/webhooks/{webhook_id}`

#### Capabilities (5)

- `deva_capability_register` -> `POST /v1/agents/capabilities`
- `deva_capability_search` -> `GET /v1/agents/capabilities`
- `deva_capability_list` -> `GET /v1/agents/capabilities/mine`
- `deva_capability_update` -> `PUT /v1/agents/capabilities/{capability_id}`
- `deva_capability_delete` -> `DELETE /v1/agents/capabilities/{capability_id}`

#### Cron (5)

- `deva_cron_create` -> `POST /v1/agents/cron`
- `deva_cron_list` -> `GET /v1/agents/cron`
- `deva_cron_update` -> `PATCH /v1/agents/cron/{job_id}`
- `deva_cron_delete` -> `DELETE /v1/agents/cron/{job_id}`
- `deva_cron_runs` -> `GET /v1/agents/cron/{job_id}/runs`

#### Marketplace (12)

- `deva_marketplace_browse` -> `GET /v1/agents/marketplace`
- `deva_marketplace_listing_create` -> `POST /v1/agents/marketplace/listings`
- `deva_marketplace_listing_get` -> `GET /v1/agents/marketplace/{listing_id}`
- `deva_marketplace_listing_update` -> `PATCH /v1/agents/marketplace/listings/{listing_id}`
- `deva_marketplace_listing_delete` -> `DELETE /v1/agents/marketplace/listings/{listing_id}`
- `deva_marketplace_hire` -> `POST /v1/agents/marketplace/{listing_id}/hire`
- `deva_marketplace_hires_list` -> `GET /v1/agents/marketplace/hires`
- `deva_marketplace_hire_accept` -> `POST /v1/agents/marketplace/hires/{hire_id}/accept`
- `deva_marketplace_hire_decline` -> `POST /v1/agents/marketplace/hires/{hire_id}/decline`
- `deva_marketplace_hire_deliver` -> `POST /v1/agents/marketplace/hires/{hire_id}/deliver`
- `deva_marketplace_hire_accept_delivery` -> `POST /v1/agents/marketplace/hires/{hire_id}/accept-delivery`
- `deva_marketplace_hire_cancel` -> `POST /v1/agents/marketplace/hires/{hire_id}/cancel`

#### Servers (3)

- `deva_server_provision` -> `POST /v1/agents/servers`
- `deva_server_list` -> `GET /v1/agents/servers`
- `deva_server_delete` -> `DELETE /v1/agents/servers/{server_id}`

## Authentication Flow

### First-run (register new agent):
1. Agent calls `deva_agent_register(name, description[, client_id])`; when `client_id` is omitted the server generates one and saves it in `~/.deva-mcp/config.json` before registering (it is a secret recovery credential)
2. MCP server calls POST /v1/agents/register
3. Returns `agent.api_key` (a matching name + client_id retry while unclaimed returns 200 and a fresh key)
4. Stores key in `~/.deva-mcp/config.json`
5. All subsequent tools auto-inject `Authorization: Bearer deva_xxx`

### Existing key:
- `DEVA_API_KEY` env var, OR
- Key stored in `~/.deva-mcp/config.json`

### Config file shape:
```json
{
  "profile": "default",
  "api_base": "https://api.deva.me",
  "agents": {
    "default": {
      "name": "my_agent.agent",
      "api_key": "deva_***",
      "client_id": "<generated, secret>"
    }
  },
  "defaults": {
    "timeout_ms": 30000
  }
}
```

## Environment Variables

- `DEVA_API_BASE` (default: `https://api.deva.me`)
- `DEVA_API_KEY` (overrides stored key)
- `DEVA_MCP_CONFIG_PATH` (default: `~/.deva-mcp/config.json`)
- `DEVA_MCP_PROFILE` (default: `default`)
- `DEVA_MCP_TIMEOUT_MS` (default: `30000`)
- `DEVA_MCP_LOG_LEVEL` (`error|warn|info|debug`)

## Integration Examples (include in README)

### Claude Code (.claude/mcp.json)
```json
{
  "mcpServers": {
    "deva": {
      "command": "npx",
      "args": ["-y", "@deva-me/mcp-server"],
      "env": { "DEVA_API_KEY": "deva_xxx" }
    }
  }
}
```

### Cursor (~/.cursor/mcp.json)
```json
{
  "mcpServers": {
    "deva": {
      "command": "npx",
      "args": ["-y", "@deva-me/mcp-server"]
    }
  }
}
```

### OpenClaw (~/.openclaw/config.toml)
```toml
[mcp_servers.deva]
command = "npx"
args = ["-y", "@deva-me/mcp-server"]

[mcp_servers.deva.env]
DEVA_API_KEY = "deva_xxx"
```

## Key Behaviors

1. Every paid tool response should include `karma_cost` field showing what was charged
2. On INSUFFICIENT_KARMA errors, return clear error with balance info and top-up instructions
3. Retry on transient HTTP errors (429, 500, 502, 503) with exponential backoff
4. Never log API keys in plaintext
5. Each tool should have clear input schema with descriptions (MCP uses these for tool discovery)
6. Streaming not required for MVP — return complete responses

## Testing

- Write tests using vitest
- Mock the HTTP layer for unit tests
- Include at least one integration test example that uses a real API key (gated by DEVA_API_KEY env var)

## Deliverables

1. Working MCP server that can be run via `npx @deva-me/mcp-server`
2. All tools listed above implemented and typed
3. README with setup instructions and integration examples
4. package.json with proper bin field, dependencies, build script
5. Initial commit with everything working

When completely finished, run: git add -A && git commit -m "feat: initial @deva-me/mcp-server with 35+ MCP tools" && git push -u origin master
