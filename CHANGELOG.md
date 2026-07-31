# Changelog

All notable changes to the Powabase OSS self-hosted stack.

Changes are grouped by component rather than by change type, and only changes
that affect a self-hosted deployment are listed here.

Image versions are **pinned by tag** in `docker-compose.yml` — a running stack
never updates itself. To move to a newer release:

```bash
git pull                # get the new docker-compose.yml pins
docker compose pull     # fetch the new images
docker compose up -d    # recreate only the changed services
```

Entries marked **[config]** additionally require a change to `docker-compose.yml`
or `.env` beyond bumping the image tag — pulling alone is not enough. Entries
marked **[image]** are picked up by the pull.

Running a service on a version other than the one pinned in this repo is
untested; the pins are validated together.

---

## Unreleased

**These changes are on `main` and are NOT in any published image.** `docker-compose.yml`
still pins `powabase-studio:0.1.0rc3`, so a `git pull` today picks up the Kong and database
changes below but **not** the Studio ones. They ship with the next Studio release.

**Studio** · **[image]** — *not yet published*

- **Fixed: model dropdowns were permanently disabled on self-host.** Every LLM model
  picker rendered blank and disabled, so an agent could not be created. Two stacked
  causes: `ModelSelector` and `useLLMModels` gated on a raw `!token`, which is always
  empty on self-host, and the early return skipped the `.finally()` that clears the
  loading flag; and nothing served a model catalogue off-platform. Both now use
  `hasAiAuth()`, and the catalogue is sourced from the `llm_model` choice-sets in
  `GET /api/settings`.
- **Fixed: Source download and text preview returned 401.** Three page-level fetches
  still set `Authorization: Bearer <token>` by hand, replacing the `Basic` header Kong
  expects — the same class as the rc3 fix, in the three call sites it missed.
- **Fixed: a path-traversal in the project-api proxy.** A segment such as
  `..\auth/v1/admin/users` passed the POSIX normalisation guard but folded to `/auth/`
  in the URL parser `fetch()` uses, escaping `/api/` and aiming the server-injected
  service-role key at any Kong service. The proxy now validates the resolved pathname.
- **Fixed:** "+ Add pair" in the headers editor could never add a row; the JSON schema
  editor silently discarded edits when the JSON was invalid, and Save was ungated;
  proxy error bodies rendered as `[object Object]`.

**Kong** `volumes/api/kong.yml` · **[config]** — picked up by `git pull`

- **Added the `/api/observability` route.** The observability dashboard returned a
  persistent *"Session expired"* because the route did not exist.

**Database** `volumes/db/roles.sql` · **[db-init]** — ⚠️ **not picked up by `git pull` or `docker compose pull`**

- **Fixed: MCP read-only queries failed authentication.** `supabase_read_only_user` is
  created `WITH LOGIN` by the base image but with **no password**, so the read-only
  connection string could never authenticate.

  **`[db-init]` is a third category, and it is the one that catches people.** This file is
  mounted into `/docker-entrypoint-initdb.d/`, which Postgres runs **only when
  initialising an empty data directory**. An existing deployment will never re-run it, no
  matter how many times you pull. If your stack is already running, apply it by hand:

  ```bash
  docker compose exec -T db psql -U postgres -v ON_ERROR_STOP=1 <<'SQL'
  ALTER USER supabase_read_only_user WITH PASSWORD 'REPLACE_WITH_YOUR_POSTGRES_PASSWORD';
  SQL
  ```

  Use the same value as `POSTGRES_PASSWORD` in your `.env`. Fresh installs need nothing.

---

## 0.1.0rc3 — 2026-07-21

**Studio** `ghcr.io/powabase-ai/powabase-studio:0.1.0rc3` · **[image]**

- **Fixed: every AI write and streaming path returned 401 on self-host.** Source
  upload, agent runs, copilot chat, source image/text previews and orchestration
  runs all failed with a spurious *"Session expired — please refresh the page to
  sign in again"* toast on a completely healthy deployment. Refreshing did not
  help.

  Self-host has no GoTrue session, so the browser token is empty, but nine
  hand-rolled `fetch()` calls set `Authorization: Bearer <token>` unconditionally.
  Studio is served through Kong's `dashboard` route, which uses the `basic-auth`
  plugin — the browser attaches `Authorization: Basic …` automatically, and an
  explicit `Authorization` header on a `fetch` *replaces* it, so Kong rejected the
  request. Read paths were unaffected because the shared `api()` helper already
  guarded the header.

  Platform behaviour is unchanged. No backend, `.env` or Kong change is required.

_No `docker-compose.yml` change beyond the studio image tag._

## 0.1.0rc2 — 2026-07-21

**Studio** `ghcr.io/powabase-ai/powabase-studio:0.1.0rc2` · **[image]**

- **Fixed: SQL Editor could not save queries.** `SNIPPETS_MANAGEMENT_FOLDER` was
  unset, so every snippets API call returned 500 and each query you ran silently
  failed to save. The path is now baked into the image at `/app/snippets`, and the
  directory is pre-created so a named volume mounted there inherits the correct
  ownership instead of being root-owned.
- **Fixed: a request to `http://localhost:5000` failed on every page load.** The
  platform-admin (`whoami`) check now only fires when running on the platform;
  self-host has no such endpoint.
- **Fixed: repeated 404s for billing/credits.** The wallet and credits hooks fired
  despite billing being disabled in this edition; they are now gated.
- **Fixed: `favicon/manifest.json` returned 401 on every page load.** The manifest
  link now sets `crossorigin="use-credentials"` so it is fetched with the gateway
  credentials.

**Stack** · **[config]**

- `docker-compose.yml`: added the `default_studio-snippets` named volume mounted at
  `/app/snippets`, so saved SQL Editor queries survive `docker compose up -d`
  and image bumps.
- `volumes/storage/` is now tracked in the repo. Previously Docker created it on
  first boot as a root-owned directory.
- `smoke-test.sh` now asserts the SQL-Editor snippets API does not 5xx. The
  previous dashboard check only asserted the HTML shell returned 200, which stayed
  green while the editor was broken.

**Docs**

- Quickstart uses `python3 gen-keys.py`, which is the interpreter present on
  current Ubuntu/Debian.

## 0.1.0rc1 — 2026-07-20

Initial public release: the self-hostable single-project stack — Postgres,
Auth, Storage, REST, Realtime (the Supabase data plane) plus the Powabase AI
service (sources, knowledge bases, agents, workflows), behind a single Kong
gateway on `:8000`.
