# Powabase OSS — single-project stack

A self-hostable, single-project AI backend: Postgres + Auth + Storage + REST (Supabase data plane) plus
the Powabase AI service (sources, knowledge bases, agents). One `docker compose up`, no control plane.

## Prerequisites
- Docker + Docker Compose
- Python 3.11+ with `pyjwt` and `cryptography` (`pip install pyjwt cryptography`) — for `gen-keys.py`
- The `agentic-project-service:latest` image (from the monorepo: `cd ../agentic-platform && make build-packages`)

## Quickstart
```bash
cp .env.example .env        # 1. config with sane localhost defaults
python gen-keys.py          # 2. generate per-deployment secrets into .env
#                             3. set your LLM key(s): edit OPENAI_API_KEY (min) in .env
docker compose up -d        # 4. boot the 11-service stack
docker compose ps           # 5. verify — every service should read "healthy"
```
The API gateway is at `http://localhost:8000`. Bring your own LLM keys (BYOK) in `.env`.
Studio dashboard at `http://localhost:8000/` (HTTP basic-auth via `DASHBOARD_*`) — it's not a separate port, the same Kong gateway fronts it.

> ⚠ `smoke-test.sh` is a separate **destructive** CI/boot test — it runs `docker compose down -v` (wiping all volumes) at start and on exit. Use it only to validate a *fresh* boot; **never run it against a deployment whose data you want to keep** — it will destroy your database.

## Security
- The API gateway (`:8000`) is the front door. Put it behind a reverse proxy with TLS before exposing it to the internet.
- Postgres is bound to `127.0.0.1` by default — don't publish it to other hosts.
- Public signup is disabled by default (`DISABLE_SIGNUP=true` in `.env`); create your first user via the admin API (service_role key), or re-enable signup once the deployment is secured.
- `/rest/v1` and `/auth/v1` require the project `apikey` header (anon or service_role key) as of this edition — RLS then differentiates the two roles.

## Notes
- Secrets in `.env` are generated locally and never committed. `.env` is git-ignored.
- Billing is disabled in this edition (no credit charges).
- To reset: `docker compose down -v` (removes volumes).
- After rotating a secret (e.g. `DASHBOARD_PASSWORD`) in `.env` on an already-running stack, apply it with `docker compose up -d --force-recreate kong` — Kong bakes templated `${...}` values from `.env` into `kong.yml` once, at container start, so a plain `docker compose restart kong` reuses the container's original environment and won't pick up the change.
