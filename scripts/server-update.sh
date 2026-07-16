#!/usr/bin/env bash
set -Eeuo pipefail

TARGET_DIR="${1:-/opt/zapinho-api}"
SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="/tmp/zapinho-backup-${TIMESTAMP}.tar.gz"

if [[ -d "$TARGET_DIR" ]]; then
  echo "Criando backup de .env e data em $BACKUP"
  tar -czf "$BACKUP" -C "$TARGET_DIR" .env data 2>/dev/null || true
fi

mkdir -p "$TARGET_DIR"
cp -a "$SOURCE_DIR"/. "$TARGET_DIR"/
cd "$TARGET_DIR"

if [[ ! -f .env ]]; then
  bash scripts/init-env.sh
  echo "Arquivo .env criado. Revise PUBLIC_URL, CORS_ORIGIN e API_KEY antes de expor a API."
fi

if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  docker compose up -d --build
  docker compose ps
else
  command -v npm >/dev/null 2>&1 || { echo "npm não encontrado." >&2; exit 1; }
  command -v git >/dev/null 2>&1 || { echo "git não encontrado; instale para as dependências do Baileys." >&2; exit 1; }
  npm install --no-audit --no-fund
  npm run build
  if command -v pm2 >/dev/null 2>&1; then
    pm2 startOrRestart dist/index.js --name zapinho-api
    pm2 save
  else
    echo "Build concluído. Execute: cd $TARGET_DIR && npm start"
  fi
fi

echo "Atualização concluída em $TARGET_DIR"
