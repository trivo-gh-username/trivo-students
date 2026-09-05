#!/usr/bin/env bash
# Pull latest image, recreate, redeploy Caddy config.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> Pulling image"
docker compose pull

echo "==> Recreating containers"
docker compose up -d

echo "==> Redeploying Caddy site config"
"$(dirname "${BASH_SOURCE[0]}")/deploy.sh"
