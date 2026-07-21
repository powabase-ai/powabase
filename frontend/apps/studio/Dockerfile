# To be run in the root of the turbo monorepo
# NOTE: It's highly recommended to use the new builder, Buildkit. https://docs.docker.com/build/buildkit/
## USAGE:
# Build:        docker build . -f apps/studio/Dockerfile --target production -t studio:latest
# Run:          docker run -p 3000:3000 supabase/studio
# Deploy:       docker push supabase/studio:latest
# Clean build:
#    docker builder prune
#    docker build . -f apps/studio/Dockerfile --target production -t studio:latest --no-cache

FROM node:22-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

# Fixes issues with Sentry CLI and SSL certificates during build
# TODO: Git is added because it's needed to build libpg, remove it once they publish a binary on the S3 bucket
RUN apt-get update -qq && \
  apt-get install -y --no-install-recommends \
  git \
  python3 \
  ca-certificates \
  build-essential && \
  rm -rf /var/lib/apt/lists/* && \
  update-ca-certificates

RUN npm install -g pnpm@10.24.0

WORKDIR /app

# Prune unneeded dependencies with turbo (from apps/ for example)
FROM base AS turbo
COPY . .

RUN pnpm dlx turbo@2.9.3 prune studio --docker

# Install dev dependencies (only if needed)
FROM base AS deps
COPY --from=turbo /app/out/json ./
COPY --from=turbo /app/out/pnpm-lock.yaml ./
COPY ./patches/ ./patches

# No need to clean cache because production uses standalone build
RUN pnpm install --frozen-lockfile

# dev contains dependencies and source code not compiled
FROM deps AS dev
COPY --from=turbo /app/out/full ./
ENTRYPOINT ["docker-entrypoint.sh"]
EXPOSE 8082
CMD ["pnpm", "dev:studio"]

# Compile Next.js
FROM dev AS builder

# Build-time env vars (NEXT_PUBLIC_* are baked into the bundle)
ARG NEXT_PUBLIC_IS_PLATFORM=true
ARG NEXT_PUBLIC_ENVIRONMENT=local
ARG NEXT_PUBLIC_API_URL=http://localhost:5000/api
ARG NEXT_PUBLIC_GOTRUE_URL=http://localhost:8000/auth/v1
ARG NEXT_PUBLIC_SITE_URL=http://localhost:3001
ARG NEXT_PUBLIC_HCAPTCHA_SITE_KEY=10000000-ffff-ffff-ffff-000000000001
# Whether the FE renders/executes the hCaptcha widget. CI wires this from the
# same HCAPTCHA_ENABLED var that toggles GoTrue's server-side verification.
# Baked at build time (GoTrue reads it at deploy time), so flips are not atomic
# — order transitions per docs/runbooks/activate-hcaptcha.md. Ships disabled.
ARG NEXT_PUBLIC_HCAPTCHA_ENABLED=false
ARG NEXT_PUBLIC_MCP_URL=
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_GA_MEASUREMENT_ID=
ARG NEXT_PUBLIC_REDDIT_PIXEL_ID=
ARG NEXT_PUBLIC_GOOGLE_ADS_ID=
# Microsoft Clarity project id. Unlike the analytics ids above (which CI injects
# and which default empty/off), this defaults to our project so app.powabase.ai
# tracks without extra build-arg wiring; override per-deployment. lib/clarity.tsx
# still host-gates the script to app.powabase.ai regardless of this value.
ARG NEXT_PUBLIC_CLARITY_ID=x418r07bor
# Google Tag Manager container id. CI injects this from the production
# environment variable (build-and-push.yml hard-fails when empty, like
# GA/Reddit), so it defaults empty/off here for local/self-hosted builds.
ARG NEXT_PUBLIC_GTM_ID=
ARG NEXT_PUBLIC_GOOGLE_ADS_SIGNUP_LABEL=
ARG NEXT_PUBLIC_GOOGLE_ADS_PAID_LABEL=
# Upstream Supabase self-host feature-disable knob: comma-separated feature
# keys (e.g. "billing:all,credits:enabled"), read by
# apps/studio/data/profile/profile-query.ts's getProfile() only when
# !IS_PLATFORM, merged into profile.disabled_features. Defaults empty (every
# feature falls back to the bundled enabled-features.json default). Does NOT
# touch that shared JSON, so this is safe to leave unset for prod builds.
ARG NEXT_PUBLIC_DISABLED_FEATURES=

ENV NEXT_PUBLIC_IS_PLATFORM=$NEXT_PUBLIC_IS_PLATFORM
ENV NEXT_PUBLIC_ENVIRONMENT=$NEXT_PUBLIC_ENVIRONMENT
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_GOTRUE_URL=$NEXT_PUBLIC_GOTRUE_URL
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_HCAPTCHA_SITE_KEY=$NEXT_PUBLIC_HCAPTCHA_SITE_KEY
ENV NEXT_PUBLIC_HCAPTCHA_ENABLED=$NEXT_PUBLIC_HCAPTCHA_ENABLED
ENV NEXT_PUBLIC_MCP_URL=$NEXT_PUBLIC_MCP_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_GA_MEASUREMENT_ID=$NEXT_PUBLIC_GA_MEASUREMENT_ID
ENV NEXT_PUBLIC_GTM_ID=$NEXT_PUBLIC_GTM_ID
ENV NEXT_PUBLIC_REDDIT_PIXEL_ID=$NEXT_PUBLIC_REDDIT_PIXEL_ID
ENV NEXT_PUBLIC_GOOGLE_ADS_ID=$NEXT_PUBLIC_GOOGLE_ADS_ID
ENV NEXT_PUBLIC_CLARITY_ID=$NEXT_PUBLIC_CLARITY_ID
ENV NEXT_PUBLIC_GOOGLE_ADS_SIGNUP_LABEL=$NEXT_PUBLIC_GOOGLE_ADS_SIGNUP_LABEL
ENV NEXT_PUBLIC_GOOGLE_ADS_PAID_LABEL=$NEXT_PUBLIC_GOOGLE_ADS_PAID_LABEL
ENV NEXT_PUBLIC_DISABLED_FEATURES=$NEXT_PUBLIC_DISABLED_FEATURES
ENV SENTRY_IGNORE_API_RESOLUTION_ERROR=1
ENV SKIP_ASSET_UPLOAD=1
ENV NEXT_TELEMETRY_DISABLED=1

RUN pnpm --filter studio exec next build

# Copy only compiled code and dependencies
FROM base AS production

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder /app/apps/studio/public ./apps/studio/public
COPY --from=builder /app/apps/studio/.next/standalone ./
COPY --from=builder /app/apps/studio/.next/static ./apps/studio/.next/static

RUN chown -R nextjs:nodejs /app
USER nextjs

EXPOSE 3001
ENV HOSTNAME="0.0.0.0"
ENV PORT=3001
HEALTHCHECK --interval=5s --timeout=5s --retries=3 CMD node -e "fetch('http://localhost:3001/api/platform/profile').then((r) => {if (r.status !== 200) throw new Error(r.status)})"
CMD ["node", "apps/studio/server.js"]
