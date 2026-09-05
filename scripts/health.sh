#!/usr/bin/env bash
# Quick status check: containers, memory, in-process healthz.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "== docker compose ps =="
docker compose ps

echo ""
echo "== memory =="
docker stats --no-stream --format 'table {{.Name}}\t{{.MemUsage}}' trivo-students-app trivo-students-db 2>/dev/null || true

echo ""
echo -n "== app healthz (internal) == "
docker compose exec -T app node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" \
  && echo "OK" || echo "FAILED"

if [[ -f .env ]]; then
  set -a; source .env; set +a
  if command -v curl >/dev/null 2>&1 && [[ -n "${DOMAIN:-}" ]]; then
    echo -n "== https://$DOMAIN/healthz == "
    curl -fsS -o /dev/null -w '%{http_code}\n' "https://$DOMAIN/healthz" || echo "unreachable"
  fi
fi
