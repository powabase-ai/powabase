# Powabase Studio

The dashboard for the [Powabase](https://github.com/powabase-ai/powabase) OSS edition — a fork of [Supabase Studio](https://github.com/supabase/supabase/tree/master/apps/studio), adapted for single-project self-hosting.

Built with [Next.js](https://nextjs.org/) and [Tailwind](https://tailwindcss.com/).

## How it's deployed

Studio is built in **self-hosted mode** (`NEXT_PUBLIC_IS_PLATFORM=false`) and published as the container image `ghcr.io/powabase-ai/powabase-studio` (by the [powabase](https://github.com/powabase-ai/powabase) repo's `.github/workflows/publish.yml`). You don't run it standalone — the Powabase stack pulls this image and serves it through the Kong gateway on `:8000`. See the [stack architecture](https://github.com/powabase-ai/powabase#architecture) for how it fits.

It exposes the Supabase database-management surface (table & SQL editors, policies, roles, extensions) plus Powabase's AI features (sources, knowledge bases, agents).

## Running it

To use the dashboard, run the full stack — one `docker compose up` in the [Powabase stack repo](https://github.com/powabase-ai/powabase). Studio is a standard Next.js app; local development follows the same workflow as upstream Supabase Studio.

## Upstream & attribution

Powabase Studio is derived from [Supabase Studio](https://github.com/supabase/supabase), used under the [Apache-2.0 license](../../../LICENSE) (see [`NOTICE`](NOTICE) for attribution). Powabase is an independent project, **not affiliated with or endorsed by Supabase, Inc.** — "Supabase" is a trademark of Supabase, Inc.
