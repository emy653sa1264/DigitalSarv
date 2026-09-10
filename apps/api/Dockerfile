# syntax=docker/dockerfile:1.7
#
# Digital Sarv API (NestJS 12, ESM) — production image.
# Build context MUST be the repository root (pnpm workspace + lockfile live there):
#   docker build -f apps/api/Dockerfile -t digital-sarv/api .
#
# Stages: base (node + pnpm via corepack) → deps (pnpm fetch, lockfile only)
#         → build (install api deps offline, nest build, pnpm deploy --prod) → runtime (prod deps + dist only)

ARG NODE_VERSION=24

# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION}-alpine AS base
# Optional npm registry mirror (e.g. when registry.npmjs.org is slow/unreachable from the build host)
ARG NPM_REGISTRY=
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    CI=1 \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
WORKDIR /repo
# packageManager (pnpm@10.x) is pinned in the root package.json; corepack installs exactly that version
COPY package.json ./
RUN if [ -n "$NPM_REGISTRY" ]; then export COREPACK_NPM_REGISTRY="$NPM_REGISTRY"; fi \
 && corepack enable \
 && corepack install \
 && pnpm config set store-dir /pnpm/store \
 && if [ -n "$NPM_REGISTRY" ]; then pnpm config set registry "$NPM_REGISTRY"; fi

# ---------------------------------------------------------------------------
# Download every package in the lockfile into the (cached) store. Depends only on the
# lockfile, so this layer survives source-code changes.
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm fetch

# ---------------------------------------------------------------------------
FROM deps AS build
# Workspace manifests (all importers must be present for --frozen-lockfile), then the api sources
COPY apps/web/package.json apps/web/package.json
COPY apps/api apps/api
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --offline --frozen-lockfile --filter api
RUN pnpm --filter api build \
 && test -f apps/api/dist/main.js
# Self-contained production node_modules for the api only (no devDependencies, no other workspace apps).
# --legacy: pnpm 10 otherwise requires inject-workspace-packages=true for `deploy`.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm --filter api deploy --prod --legacy /prod/api

# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION}-alpine AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    UPLOAD_DIR=/data/uploads \
    NODE_OPTIONS=--enable-source-maps
WORKDIR /app

# App files stay root-owned (read-only for the runtime user); only the upload dir is writable.
COPY --from=build /prod/api/package.json ./package.json
COPY --from=build /prod/api/node_modules ./node_modules
COPY --from=build /repo/apps/api/dist ./dist
RUN mkdir -p /data/uploads && chown node:node /data/uploads

USER node
EXPOSE 3000
VOLUME ["/data/uploads"]

# Liveness: the process answers HTTP. (Readiness incl. mongo/redis is /api/health/ready.)
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Nest enables shutdown hooks; compose runs with `init: true` so SIGTERM is forwarded cleanly.
CMD ["node", "dist/main.js"]
