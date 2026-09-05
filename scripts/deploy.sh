#!/usr/bin/env bash
# scripts/deploy.sh — resolve this app's Caddy site file from its own .env
# and drop the result into ../edge/sites/, then trigger a reload. Same
# pattern as trivo-lean and ai-vision-demo — see ../edge/README.md.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "[deploy] .env not found — copy .env.example to .env and fill it in first." >&2
  exit 1
fi
set -a
# shellcheck disable=SC1091
source .env
set +a

: "${DOMAIN:?DOMAIN must be set in .env}"
EDGE_DIR="${EDGE_DIR:-../edge}"

if [ ! -d "$EDGE_DIR" ]; then
  echo "[deploy] Can't find the edge/ stack at $EDGE_DIR — set EDGE_DIR or check it out alongside this repo." >&2
  exit 1
fi
if ! command -v envsubst >/dev/null 2>&1; then
  echo "[deploy] envsubst not found — install gettext-base (apt) or gettext (brew)." >&2
  exit 1
fi

OUT="$EDGE_DIR/sites/trivo-students.conf"
echo "[deploy] resolving deploy/caddy-site.conf.tmpl -> $OUT"
DOMAIN="$DOMAIN" envsubst '${DOMAIN}' < deploy/caddy-site.conf.tmpl > "$OUT"

echo "[deploy] triggering edge reload..."
( cd "$EDGE_DIR" && ./scripts/reload.sh )

echo "[deploy] done. Live at https://$DOMAIN"
