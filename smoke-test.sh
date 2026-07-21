#!/usr/bin/env bash
# smoke-test.sh — a DESTRUCTIVE CI/dev boot check.
#
# WARNING: runs `docker compose down -v` at start AND on exit, WIPING all volumes
# (database + storage). It validates a FRESH boot from scratch — it is NOT a
# health check for a running deployment. NEVER run it against a stack whose data
# you want to keep. For a live check, use `docker compose ps`.
set -euo pipefail
cd "$(dirname "$0")"
echo "==> DESTRUCTIVE smoke test: wipes all volumes (down -v) at start + on exit."

# Tear the stack down on ANY exit (pass or fail) so containers never leak.
trap 'docker compose down -v --remove-orphans' EXIT

# Pre-clean before boot: a persisted .init_complete sentinel in the
# default_db-data volume masks SQL edits, so drop stale containers + volumes.
echo "==> pre-clean (down -v --remove-orphans)"
docker compose down -v --remove-orphans

echo "==> compose up"
docker compose up -d

echo "==> waiting for db init to complete (mark-ready sentinel + pg_isready), max 180s"
for i in $(seq 1 60); do
  if [ "$(docker compose ps db --format '{{.Health}}' 2>/dev/null)" = "healthy" ]; then break; fi
  sleep 3
  [ "$i" = 60 ] && { echo "FAIL: db never healthy"; docker compose logs db | tail -40; exit 1; }
done

echo "==> waiting for project-worker to become healthy (celery inspect ping), max 180s"
for i in $(seq 1 60); do
  if [ "$(docker compose ps project-worker --format '{{.Health}}' 2>/dev/null)" = "healthy" ]; then break; fi
  sleep 3
  [ "$i" = 60 ] && { echo "FAIL: project-worker never healthy"; docker compose logs project-worker | tail -40; exit 1; }
done

echo "==> asserting the 'ai' schema and a core table exist"
docker compose exec -T db psql -U postgres -d postgres -tAc \
  "select count(*) from information_schema.schemata where schema_name='ai';" | grep -qx 1 \
  || { echo "FAIL: ai schema missing"; exit 1; }
docker compose exec -T db psql -U postgres -d postgres -tAc \
  "select count(*) from information_schema.tables where table_schema='ai' and table_name='knowledge_bases';" \
  | grep -qx 1 || { echo "FAIL: ai.knowledge_bases missing"; exit 1; }

echo "==> asserting Kong routes to project-api health"
KONG_PORT="$(grep -E '^KONG_HTTP_PORT=' .env | cut -d= -f2)"
curl -fsS "http://localhost:${KONG_PORT}/api/health" >/dev/null \
  || { echo "FAIL: project-api health not reachable via Kong"; docker compose logs kong project-api | tail -40; exit 1; }

echo "==> asserting GoTrue (auth) is serving"
docker compose exec -T auth wget -qO- http://localhost:9999/health >/dev/null 2>&1 \
  || curl -fsS "http://localhost:${KONG_PORT}/auth/v1/health" >/dev/null \
  || { echo "FAIL: GoTrue not healthy"; exit 1; }

echo "==> asserting API_KEY_ENCRYPTION_KEY round-trips inside project-api"
docker compose exec -T project-api python -c "
from agentic_project_service.services.encryption import encrypt_api_key, decrypt_api_key
assert decrypt_api_key(encrypt_api_key('sk-smoke')) == 'sk-smoke'
print('encryption round-trip OK')
" || { echo "FAIL: encryption round-trip (bad API_KEY_ENCRYPTION_KEY?)"; exit 1; }

echo "==> asserting Studio dashboard is reachable via Kong, gated by basic-auth"
DASHBOARD_USERNAME="$(grep -E '^DASHBOARD_USERNAME=' .env | cut -d= -f2)"
DASHBOARD_PASSWORD="$(grep -E '^DASHBOARD_PASSWORD=' .env | cut -d= -f2)"
NOAUTH_STATUS="$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:${KONG_PORT}/")"
[ "$NOAUTH_STATUS" = "401" ] \
  || { echo "FAIL: dashboard route without credentials returned $NOAUTH_STATUS, expected 401"; exit 1; }
curl -fsS -u "${DASHBOARD_USERNAME}:${DASHBOARD_PASSWORD}" "http://localhost:${KONG_PORT}/project/default" >/dev/null \
  || { echo "FAIL: dashboard route with basic-auth credentials did not return 200"; docker compose logs kong studio | tail -40; exit 1; }

echo "PASS: OSS single-project stack is up and healthy."
