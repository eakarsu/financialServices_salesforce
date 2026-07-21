#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
assigned_port="${BACKEND_PORT:-${PORT:-}}"
[[ "$assigned_port" =~ ^[0-9]+$ ]] || { echo "BACKEND_PORT or PORT must be an assigned numeric port" >&2; exit 2; }
if lsof -tiTCP:"$assigned_port" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Assigned port $assigned_port is already in use; no process was stopped" >&2
  exit 1
fi
if [ -f .env ]; then set -a; . ./.env; set +a; fi
export BACKEND_PORT="$assigned_port"
export PORT="$assigned_port"
node server.js
