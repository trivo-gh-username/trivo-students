#!/usr/bin/env bash
# Sanity-checks .env before you run docker compose up.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

if [[ -t 1 ]]; then RED=$'\033[31m'; YEL=$'\033[33m'; GRN=$'\033[32m'; R=$'\033[0m'; else RED=; YEL=; GRN=; R=; fi
FAIL=0
warn() { echo -e "${YEL}WARN${R}  $1"; }
bad()  { echo -e "${RED}FAIL${R}  $1"; FAIL=1; }
ok()   { echo -e "${GRN}OK${R}    $1"; }

if [[ ! -f .env ]]; then
  bad ".env not found — cp .env.example .env"
  exit 1
fi
set -a; source .env; set +a

[[ -z "${DOMAIN:-}" ]] && bad "DOMAIN is empty" || ok "DOMAIN=$DOMAIN"
[[ -z "${ADMIN_PASSWORD:-}" ]] && bad "ADMIN_PASSWORD is empty" || ok "ADMIN_PASSWORD is set"
[[ -z "${SESSION_SECRET:-}" ]] && bad "SESSION_SECRET is empty" || ok "SESSION_SECRET is set"
[[ -z "${POSTGRES_PASSWORD:-}" ]] && bad "POSTGRES_PASSWORD is empty" || ok "POSTGRES_PASSWORD is set"

if [[ "${SESSION_SECRET:-}" == "local-dev-secret-please-change" ]]; then
  bad "SESSION_SECRET is still the local-dev placeholder"
fi

exit $FAIL
