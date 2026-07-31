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

## 0.1.0rc5 — 2026-07-31

**AI service** `ghcr.io/powabase-ai/powabase-ai:0.1.0rc3` · **[image]**

- **Rebuilt from current source.** The `rc2` image was built from an earlier commit than
  the repository head, so two files inside it lagged the source tree. No runtime
  behaviour changes: the image now also bundles `powabase-agentic 0.1.0rc3`, whose
  packaged library code is identical to `rc2`.

_No `docker-compose.yml` change beyond the AI service image tag._

## 0.1.0rc4 — 2026-07-31

This release moves **two** images. Besides the new Studio build, the AI service pin
advances `0.1.0rc1 → 0.1.0rc2` — that image was published on 2026-07-28, but
`docker-compose.yml` had never been pointed at it, so no self-hosted stack has been
running it. Everything in the **AI service** section below has been available to pull
for some time and is only now reachable.

**Studio** `ghcr.io/powabase-ai/powabase-studio:0.1.0rc4` · **[image]**

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

**AI service** `ghcr.io/powabase-ai/powabase-ai:0.1.0rc2` · **[image]**

The pin moves from `0.1.0rc1`, so a stack updating to this release picks up everything
below at once. The image also carries `powabase-agentic 0.1.0rc2` in place of `rc1`.

- **Fixed: orchestration runs ignored configured hooks.** Supervisor-strategy
  orchestrations never fired `OnRunStart`, `PreToolUse`, `PostToolUse`, `OnDelegation`,
  `PreResponse` or `OnRunComplete`, so hooks that worked on a single agent silently did
  nothing once the same work ran through an orchestration. Runs now emit a `hook_result`
  event recording each hook's outcome — blocked, modified or allowed — instead of leaving
  callers to infer it from side effects.
- **Fixed: a `PreResponse` hook's edit could lose the race against streaming.** A
  hook-modified answer could reach the stream's `complete` event before the modification
  was applied to the persisted content, so the caller saw the unedited text. Affected the
  single-agent path as well.
- **Fixed: hook CRUD accepted configurations that could never run.** Event and type are
  now validated, dead or unreachable configs are rejected, orchestration hooks are gated
  to the supervisor strategy, and execution is ordered by `(position, created_at)` rather
  than arbitrarily.
- **Fixed: a second workflow input mapping onto the same field was silently dropped.**
  The first mapping set the field, then the second hit the "skip if a value already
  exists" guard that exists for genuine user-typed overrides. Repeat targets now
  concatenate (newline-joined for strings, last-wins otherwise), while a real pre-set
  user value still wins over any mapping.
- **Fixed: model context windows were guessed, not resolved.** A model's real context
  window is now read from the OpenRouter registry, falling back to
  `litellm.get_model_info` and only then to a conservative default *with a warning*, so
  an unresolved model stays visible instead of being silently mis-sized.
- **Fixed: compaction was effectively inoperative whenever an image was in the history.**
  Multimodal blocks were sized with a flat proxy weight that undercounted a real base64
  image payload by roughly three orders of magnitude, so the "are we under target?"
  postcondition could pass on a still-oversized history. Blocks are now measured by
  actual payload. Compaction also runs on the same model as the real call — no separately
  configured model required — and reuses the cached history prefix instead of forcing a
  cold call.
- **Removed five obsolete compaction settings** and their now-empty category. None was
  ever read by a `get_setting()` call.

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
