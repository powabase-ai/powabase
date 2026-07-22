# Powabase OSS — single-project stack

A self-hostable, single-project AI backend: Postgres + Auth + Storage + REST (Supabase data plane) plus
the Powabase AI service (sources, knowledge bases, agents). One `docker compose up`, no control plane.

## Architecture

Powabase's OSS edition is **one self-contained stack** you run with Docker
Compose. It spans three repositories:

| Repo | What it is | How you use it |
|---|---|---|
| **[powabase](https://github.com/powabase-ai/powabase)** (this repo) | The self-host **stack** — Docker Compose, the Kong gateway, the `ai` schema, and the Studio dashboard | `docker compose up` — **this is the repo you run** |
| **[powabase-ai](https://github.com/powabase-ai/powabase-ai)** | The **AI backend service** (`ghcr.io/powabase-ai/powabase-ai`) — sources, knowledge bases, agents, workflows | pulled automatically by the compose; you don't run it directly |
| **[agentic](https://github.com/powabase-ai/agentic)** (PyPI [`powabase-agentic`](https://pypi.org/project/powabase-agentic/)) | The **library** the backend is built on — agents, knowledge, orchestration, workflows | `pip install powabase-agentic`, only if you want it standalone |

Everything is reached through a single Kong gateway on `:8000`:

```mermaid
flowchart TD
  U["Browser / your app"] --> K["Kong · API gateway :8000"]
  K --> S["Studio · dashboard"]
  K --> A["GoTrue · auth"]
  K --> R["PostgREST · REST API"]
  K --> ST["Storage · files"]
  K --> RT["Realtime · websockets"]
  K --> API["powabase-ai · AI backend"]
  API --> DB[("Postgres 15 + pgvector")]
  API --> RD[("Redis")]
  WK["Celery worker · background jobs"] --> DB
  WK --> RD
  API -. built on .-> LIB["powabase-agentic library"]
```

<details>
<summary><strong>The 12 services in the stack</strong></summary>

**Powabase AI** (this edition's addition)
- `project-api` — AI backend HTTP API: sources, knowledge bases, agents, workflows · `ghcr.io/powabase-ai/powabase-ai`
- `project-worker` — Celery worker: extraction, chunking, embedding, indexing · same image
- `redis` — Celery broker + result backend

**Supabase data plane**
- `kong` — API gateway; the single front door on `:8000`
- `studio` — the dashboard UI · `ghcr.io/powabase-ai/powabase-studio`
- `auth` — GoTrue: users, sign-in, JWTs
- `rest` — PostgREST: auto-generated REST API over your tables
- `storage` — S3-style file storage
- `imgproxy` — on-the-fly image transforms for Storage
- `meta` — postgres-meta: schema introspection for Studio
- `realtime` — Postgres change broadcasts over WebSockets
- `db` — Postgres 15 + pgvector: your data plus the `ai` schema

</details>

## Built on Supabase

Powabase's data plane **is** the upstream [Supabase](https://supabase.com) self-hosted stack — GoTrue, PostgREST, Storage, Realtime, postgres-meta, and Postgres — running the official images unchanged. We didn't reinvent the backend: we added a single-project deployment model and the Powabase AI service (knowledge bases, agents, workflows) on top, and forked Studio only to surface those AI features. That's the whole point of open-sourcing this — you can verify exactly what we changed and what we didn't.

Supabase is a trademark of Supabase, Inc. Powabase is an independent project, **not affiliated with or endorsed by Supabase**. Supabase components are used under their respective open-source licenses (Apache-2.0); attribution for the forked Studio is in [`frontend/apps/studio/NOTICE`](frontend/apps/studio/NOTICE).

## Prerequisites
- Docker + Docker Compose
- Python 3.11+ with `pyjwt` and `cryptography` (`pip install pyjwt cryptography`) — only to run `gen-keys.py` once (the Quickstart uses `python3`; if your system only has `python`, drop the `3`).

No image build is needed — `docker compose up` pulls the published images from GitHub Container Registry (ghcr.io).

## Quickstart
```bash
cp .env.example .env        # 1. config with sane localhost defaults
python3 gen-keys.py         # 2. generate per-deployment secrets into .env
```
**3. Set your LLM key — required.** Open `.env` and set `OPENAI_API_KEY` to your own key (BYOK). **The stack will not start without it** — the AI backend hard-requires an embeddings key, so `docker compose up` fails fast if it's unset. Add other providers (`ANTHROPIC_API_KEY`, etc.) the same way.
```bash
docker compose up -d        # 4. pull the published images + boot the 12-service stack
docker compose ps           # 5. every service should read "healthy" (give it ~1–2 min)
```
Then open **`http://localhost:8000`** and log in to the **Studio dashboard** with the `DASHBOARD_USERNAME` / `DASHBOARD_PASSWORD` values `gen-keys.py` wrote into your `.env` (it's HTTP basic-auth at the gateway). The same Kong gateway fronts both the dashboard and the API — there's no separate port.

### Create your first user
Public signup is disabled by default, so bootstrap the first user with the admin API, using the `SERVICE_ROLE_KEY` from your `.env`:
```bash
SR=$(grep '^SERVICE_ROLE_KEY=' .env | cut -d= -f2)
curl -X POST http://localhost:8000/auth/v1/admin/users \
  -H "apikey: $SR" -H "Authorization: Bearer $SR" -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"change-me-please","email_confirm":true}'
```
Sign in with those credentials from your app or the API. To allow open signup instead, set `DISABLE_SIGNUP=false` in `.env` (only once your deployment is secured).

> ⚠ `smoke-test.sh` is a separate **destructive** CI/boot test — it runs `docker compose down -v` (wiping all volumes) at start and on exit. Use it only to validate a *fresh* boot; **never run it against a deployment whose data you want to keep** — it will destroy your database.

## Security
- The API gateway (`:8000`) is the front door. Put it behind a reverse proxy with TLS before exposing it to the internet.
- Postgres is bound to `127.0.0.1` by default — don't publish it to other hosts.
- Public signup is disabled by default (`DISABLE_SIGNUP=true` in `.env`) — bootstrap access via [Create your first user](#create-your-first-user); re-enable signup only once the deployment is secured.
- `/rest/v1` and `/auth/v1` require the project `apikey` header (anon or service_role key) as of this edition — RLS then differentiates the two roles.

## Updating
Image versions are **pinned by tag** in `docker-compose.yml` (e.g. `:0.1.0rc3`) — a running stack never updates itself. To move to a newer release:
```bash
git pull                # get the new docker-compose.yml pins
docker compose pull     # fetch the new images
docker compose up -d    # recreate only the changed services
```
See [`CHANGELOG.md`](CHANGELOG.md) for what changed in each release, and whether it needs more than an image bump. Running a service on a version other than the one pinned here is untested — the pins are validated together.

## Notes
- Secrets in `.env` are generated locally and never committed. `.env` is git-ignored.
- To reset: `docker compose down -v` (removes volumes).
- After rotating a secret (e.g. `DASHBOARD_PASSWORD`) in `.env` on an already-running stack, apply it with `docker compose up -d --force-recreate kong` — Kong bakes templated `${...}` values from `.env` into `kong.yml` once, at container start, so a plain `docker compose restart kong` reuses the container's original environment and won't pick up the change.
