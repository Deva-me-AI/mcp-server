#!/usr/bin/env bash
set -euo pipefail

API_BASE="${DEVA_API_BASE:-https://api.deva.me}"
API_KEY="${DEVA_API_KEY:-}"
RESULTS_FILE="${RESULTS_FILE:-/tmp/mcp-e2e-results.md}"

if [[ -z "${API_KEY}" ]]; then
  echo "DEVA_API_KEY is required" >&2
  exit 1
fi

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

ENDPOINT_RESULTS=()
BALANCE_BEFORE="N/A"
BALANCE_AFTER="N/A"

json_or_raw() {
  local file="$1"
  node -e "const fs=require('fs');const p=process.argv[1];try{const t=fs.readFileSync(p,'utf8');const j=JSON.parse(t);process.stdout.write(JSON.stringify(j));}catch{process.stdout.write(fs.readFileSync(p,'utf8').replace(/\\s+/g,' ').trim());}" "${file}"
}

call() {
  local key="$1" method="$2" path="$3" body="${4:-}"
  local out="${TMP_DIR}/${key}.json"
  : >"${out}"
  local status
  local curl_rc
  if [[ -n "${body}" ]]; then
    set +e
    status="$(curl -sS -o "${out}" -w "%{http_code}" -X "${method}" "${API_BASE}${path}" \
      -H "Authorization: Bearer ${API_KEY}" \
      -H "Content-Type: application/json" \
      --data "${body}")"
    curl_rc=$?
    set -e
  else
    set +e
    status="$(curl -sS -o "${out}" -w "%{http_code}" -X "${method}" "${API_BASE}${path}" \
      -H "Authorization: Bearer ${API_KEY}" \
      -H "Content-Type: application/json")"
    curl_rc=$?
    set -e
  fi
  if [[ ${curl_rc} -ne 0 ]]; then
    ENDPOINT_RESULTS+=("${key}|${method}|${path}|CURL_ERROR|curl failed (dns/network unavailable)")
    return 0
  fi
  ENDPOINT_RESULTS+=("${key}|${method}|${path}|${status}|$(json_or_raw "${out}")")
}

safe_call() {
  call "$@"
}

extract_balance() {
  local key="$1"
  local out="${TMP_DIR}/${key}.json"
  if [[ -f "${out}" ]]; then
    node -e "const fs=require('fs');const p=process.argv[1];try{const j=JSON.parse(fs.readFileSync(p,'utf8'));const v=j.balance??j.karma??j?.data?.balance??j?.data?.karma??'';if(v!==undefined&&v!==null)process.stdout.write(String(v));}catch{}" "${out}"
  fi
}

safe_call "balance_before" GET "/v1/agents/karma/balance"
BALANCE_BEFORE="$(extract_balance balance_before)"
if [[ -z "${BALANCE_BEFORE}" ]]; then BALANCE_BEFORE="Unknown"; fi

safe_call "agent_profile" GET "/v1/agents/profile"
safe_call "kv_put" PUT "/v1/agents/kv/test-key" '{"value":"hello"}'
safe_call "kv_get" GET "/v1/agents/kv/test-key"
safe_call "tts" POST "/v1/ai/tts" '{"text":"hello world","voice":"nova"}'
safe_call "x_search" POST "/v1/tools/x/search" '{"query":"deva ai","max_results":1}'
safe_call "conversations" GET "/v1/agents/messages/conversations"
safe_call "catalog" GET "/v1/agents/resources/catalog"
safe_call "estimate" POST "/v1/agents/resources/estimate" '{"resource_id":"tts","params":{"text":"hello"}}'

safe_call "balance_after" GET "/v1/agents/karma/balance"
BALANCE_AFTER="$(extract_balance balance_after)"
if [[ -z "${BALANCE_AFTER}" ]]; then BALANCE_AFTER="Unknown"; fi

{
  echo "# MCP E2E Results"
  echo
  echo "- API Base: ${API_BASE}"
  echo "- Timestamp (UTC): $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  echo
  echo "## Endpoint Results"
  echo
  echo "| Key | Method | Path | Status | Response |"
  echo "|---|---|---|---|---|"
  for row in "${ENDPOINT_RESULTS[@]}"; do
    IFS='|' read -r key method path status response <<<"${row}"
    response="${response//|/\\|}"
    echo "| ${key} | ${method} | ${path} | ${status} | \`${response}\` |"
  done
  echo
  echo "## Karma Balance"
  echo
  echo "- Before: ${BALANCE_BEFORE}"
  echo "- After: ${BALANCE_AFTER}"
} >"${RESULTS_FILE}"

echo "Wrote ${RESULTS_FILE}"
