#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"
TEMPLATE="$ROOT_DIR/.env.example"

if [[ -f "$ENV_FILE" && "${1:-}" != "--force" ]]; then
  echo "Existing .env kept: $ENV_FILE"
  exit 0
fi

command -v shuf >/dev/null 2>&1 || { echo "shuf is required (coreutils)." >&2; exit 1; }
cp "$TEMPLATE" "$ENV_FILE"

PORT=""
for _ in $(seq 1 100); do
  CANDIDATE="$(shuf -i 9000-9999 -n 1)"
  if command -v ss >/dev/null 2>&1 && ss -ltnH 2>/dev/null | awk '{print $4}' | grep -Eq "[:.]${CANDIDATE}$"; then
    continue
  fi
  PORT="$CANDIDATE"
  break
done

if [[ -z "$PORT" ]]; then
  PORT=9467
fi

if command -v openssl >/dev/null 2>&1; then
  API_KEY="zf_live_$(openssl rand -hex 24)"
else
  API_KEY="zf_live_$(tr -dc 'a-f0-9' </dev/urandom | head -c 48)"
fi

sed -i "s/^PORT=.*/PORT=${PORT}/" "$ENV_FILE"
sed -i "s#^PUBLIC_URL=.*#PUBLIC_URL=http://localhost:${PORT}#" "$ENV_FILE"
sed -i "s/^API_KEY=.*/API_KEY=${API_KEY}/" "$ENV_FILE"

echo "Environment created: $ENV_FILE"
echo "Port: $PORT"
echo "Review PUBLIC_URL and CORS_ORIGIN before exposing the service."
