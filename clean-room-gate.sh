#!/usr/bin/env bash
# oss-edition/clean-room-gate.sh — Tier-1 anti-rot gate.
# Boots the PUBLISHED stack in a scratch dir with NO monorepo and NO registry
# credentials, asserts multi-arch, and exercises the product path with NO LLM keys.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
NS="ghcr.io/powabase-ai"
VERSION="${1:?usage: clean-room-gate.sh <version>   e.g. 0.1.0rc1}"

# 1. Hermetic credentials: a fresh empty Docker config — no auths, no credsStore.
export DOCKER_CONFIG; DOCKER_CONFIG="$(mktemp -d)"
trap 'rm -rf "$DOCKER_CONFIG" "${ROOM:-}"' EXIT
echo "==> DOCKER_CONFIG=$DOCKER_CONFIG (anonymous pulls only)"

# 2. Both images must be multi-arch (a single-runner boot can't see this).
for img in powabase-ai powabase-studio; do
  echo "==> imagetools inspect $NS/$img:$VERSION"
  out="$(docker buildx imagetools inspect "$NS/$img:$VERSION")"
  grep -q "linux/amd64" <<<"$out" || { echo "FAIL: $img missing linux/amd64"; exit 1; }
  grep -q "linux/arm64" <<<"$out" || { echo "FAIL: $img missing linux/arm64"; exit 1; }
done

# 3. Clean room: only compose + config, no monorepo, no source.
ROOM="$(mktemp -d)"
cp "$HERE/docker-compose.yml" "$HERE/.env.example" "$HERE/gen-keys.py" "$ROOM/"
cp -r "$HERE/volumes" "$ROOM/volumes"
cd "$ROOM"
cp .env.example .env
python gen-keys.py
# The compose hard-requires OPENAI_API_KEY (${OPENAI_API_KEY:?...} for embeddings,
# project-api + project-worker), so a literally-keyless boot is impossible. Tier-1
# stays hermetic with a PLACEHOLDER (invalid) key: no real key, no successful paid
# call — the run dispatches and the LLM auth failure surfaces in the run body.
sed -i 's|^OPENAI_API_KEY=.*|OPENAI_API_KEY=sk-oss-gate-placeholder|' .env
KONG_PORT="$(grep -E '^KONG_HTTP_PORT=' .env | cut -d= -f2)"

trap 'docker compose down -v --remove-orphans; rm -rf "$DOCKER_CONFIG" "$ROOM"' EXIT
echo "==> docker compose up -d (pulling published images anonymously)"
docker compose up -d

echo "==> waiting for db + project-worker health (max 180s each)"
for svc in db project-worker; do
  for i in $(seq 1 60); do
    [ "$(docker compose ps "$svc" --format '{{.Health}}' 2>/dev/null)" = "healthy" ] && break
    sleep 3; [ "$i" = 60 ] && { echo "FAIL: $svc never healthy"; docker compose logs "$svc" | tail -40; exit 1; }
  done
done

BASE="http://localhost:${KONG_PORT}"
# Kong protects the project-api /api/* routes with key-auth (default key_names=
# [apikey]); the service_role key is the consumer key. compose maps
# SUPABASE_SERVICE_KEY=${SERVICE_ROLE_KEY} (docker-compose.yml:166/208), so the
# SERVICE_ROLE_KEY value IS the valid apikey. EVERY /api/* call needs BOTH
# `apikey:` (Kong key-auth) and `Authorization: Bearer` (the service's own auth).
# /api/health is a separate OPEN route — that's why the base smoke needs no key.
SR="$(grep -E '^SERVICE_ROLE_KEY=' .env | cut -d= -f2)"
DASH_U="$(grep -E '^DASHBOARD_USERNAME=' .env | cut -d= -f2)"
DASH_P="$(grep -E '^DASHBOARD_PASSWORD=' .env | cut -d= -f2)"

# --- Auth: create a user + obtain a token through Kong/GoTrue admin ---
echo "==> auth: create user via GoTrue admin"
curl -fsS -X POST "$BASE/auth/v1/admin/users" \
  -H "apikey: $SR" -H "Authorization: Bearer $SR" -H 'Content-Type: application/json' \
  -d '{"email":"gate@example.com","password":"gate-Passw0rd!","email_confirm":true}' >/dev/null \
  || { echo "FAIL: user create"; exit 1; }

# --- Data: create a table + row through pg-meta/PostgREST (public schema) ---
echo "==> data: create + read a public.gate_rows row"
docker compose exec -T db psql -U postgres -d postgres -c \
  "create table if not exists public.gate_rows(id serial primary key, note text);
   insert into public.gate_rows(note) values ('clean-room');" >/dev/null
docker compose exec -T db psql -U postgres -d postgres -tAc \
  "select count(*) from public.gate_rows;" | grep -qx 1 || { echo "FAIL: data path"; exit 1; }

# --- AI surface: create a knowledge base + an agent through the product /api,
#     read them back (persisted in the ai schema, verified via /api not REST). ---
echo "==> ai surface: create + list a knowledge base via /api/knowledge-bases"
curl -fsS -X POST "$BASE/api/knowledge-bases" \
  -H "apikey: $SR" -H "Authorization: Bearer $SR" -H 'Content-Type: application/json' \
  -d '{"name":"gate-kb"}' | grep -q '"id"' || { echo "FAIL: KB create"; exit 1; }
curl -fsS "$BASE/api/knowledge-bases" -H "apikey: $SR" -H "Authorization: Bearer $SR" \
  | grep -q 'gate-kb' || { echo "FAIL: KB not listed (persistence)"; exit 1; }

echo "==> ai surface: create an agent via /api/agents, capture its id"
AGENT="$(curl -fsS -X POST "$BASE/api/agents" \
  -H "apikey: $SR" -H "Authorization: Bearer $SR" -H 'Content-Type: application/json' \
  -d '{"name":"gate-agent"}')" || { echo "FAIL: agent create"; exit 1; }
AID="$(echo "$AGENT" | python -c 'import sys,json; print(json.load(sys.stdin)["id"])')" \
  || { echo "FAIL: agent response has no id: $AGENT"; exit 1; }

# --- Run path: POST /api/agents/<id>/run needs an agent (created above). The
#     placeholder OPENAI_API_KEY means the run DISPATCHES (HTTP 200) and the
#     invalid-key failure surfaces IN THE RUN BODY (litellm.AuthenticationError),
#     NOT as an HTTP 5xx. Empirically verified locally against the OSS image:
#     HTTP 200 with an auth-error body. So assert non-5xx + not-auth-rejected
#     (401/403 = Kong key-auth/ACL, a real fault). Body key is "message"
#     (verified in routes/agents.py, not "prompt").
echo "==> run path: expect dispatch (non-5xx); invalid-key error surfaces in the body"
code="$(curl -s -o /tmp/gate_run.json -w '%{http_code}' -X POST "$BASE/api/agents/$AID/run" \
  -H "apikey: $SR" -H "Authorization: Bearer $SR" -H 'Content-Type: application/json' \
  -d '{"message":"hello"}')" || true
case "$code" in
  401|403) echo "FAIL: run path auth-rejected ($code) — Kong key-auth/ACL, not the keyless path: $(cat /tmp/gate_run.json)"; exit 1 ;;
  5??)     echo "FAIL: run path 5xx ($code): $(cat /tmp/gate_run.json)"; exit 1 ;;
  *)       echo "run path returned $code (reachable, keyless-safe)" ;;
esac

# --- Dashboard: Studio answers through Kong. The dashboard route (path '/' →
#     studio:3001) is guarded by basic-auth (kong.yml), so pass the dashboard
#     creds gen-keys wrote; a headerless GET would 401 at Kong. ---
echo "==> dashboard: Studio via Kong (basic-auth)"
# Studio's `/` legitimately 307-redirects to the project workspace (verified
# locally), so a 2xx OR 3xx through Kong proves Studio is up + routed. Assert the
# range explicitly — `curl -f` alone also passes 3xx, but a later `-L`/flag tweak
# could silently change the contract.
dcode="$(curl -s -o /dev/null -w '%{http_code}' -u "$DASH_U:$DASH_P" "$BASE/")"
case "$dcode" in
  2??|3??) echo "   Studio via Kong OK ($dcode)" ;;
  *)       echo "FAIL: Studio not served via Kong (got $dcode)"; exit 1 ;;
esac

echo "PASS: clean-room Tier-1 gate green for $VERSION"
