#!/usr/bin/env bash
# Resolves this app's own Caddy site template exactly the way
# scripts/deploy.sh would, then validates the result.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

if [[ -t 1 ]]; then GRN=$'\033[32m'; RED=$'\033[31m'; R=$'\033[0m'; else GRN=; RED=; R=; fi
if [[ -f .env ]]; then set -a; source .env; set +a; fi
DOMAIN="${DOMAIN:-students.example.com}"

TMP=$(mktemp)
trap 'rm -f "$TMP"' EXIT
DOMAIN="$DOMAIN" envsubst '${DOMAIN}' < deploy/caddy-site.conf.tmpl > "$TMP"

docker run --rm -v "$TMP:/etc/caddy/Caddyfile:ro" caddy:2-alpine \
  caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile \
  && echo -e "${GRN}✓ resolved Caddy site config is valid${R}" \
  || { echo -e "${RED}✗ failed validation${R}"; exit 1; }
