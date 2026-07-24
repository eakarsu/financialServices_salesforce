#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$project_dir"
if [[ -f .env ]]; then
  set -a
  source ./.env
  set +a
fi

api_port="${BACKEND_PORT:-${PORT:-}}"
ui_port="${FRONTEND_PORT:-${CLIENT_PORT:-}}"
[[ "$api_port" =~ ^[0-9]+$ ]] || { echo "BACKEND_PORT or PORT must be an assigned numeric port" >&2; exit 2; }
[[ "$ui_port" =~ ^[0-9]+$ ]] || { echo "FRONTEND_PORT or CLIENT_PORT must be an assigned numeric port" >&2; exit 2; }
for port in "$api_port" "$ui_port"; do
  if lsof -tiTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "Assigned port $port is already in use; no process was stopped" >&2
    exit 1
  fi
done

export BACKEND_PORT="$api_port" PORT="$api_port" FRONTEND_PORT="$ui_port"
node migrate.js
BOOTSTRAP_TENANT_SLUG="${TENANT_ID:-runtime-tenant}" \
BOOTSTRAP_TENANT_NAME="${BOOTSTRAP_TENANT_NAME:-Runtime Acceptance}" \
BOOTSTRAP_MANAGER_EMAIL="${PROVISION_ADMIN_EMAIL:-${ADMIN_EMAIL:-}}" \
BOOTSTRAP_MANAGER_PASSWORD="${PROVISION_ADMIN_PASSWORD:-${ADMIN_PASSWORD:-}}" \
node scripts/bootstrap-tenant.js

node server.js &
api_pid=$!
(cd frontend && BACKEND_URL="http://127.0.0.1:$api_port" npm run dev -- --host 127.0.0.1 --port "$ui_port") &
ui_pid=$!
cleanup() {
  kill "$api_pid" "$ui_pid" 2>/dev/null || true
  wait "$api_pid" "$ui_pid" 2>/dev/null || true
}
trap cleanup EXIT INT TERM
echo "Governed sales UI starting at http://127.0.0.1:$ui_port"
wait "$api_pid" "$ui_pid"
