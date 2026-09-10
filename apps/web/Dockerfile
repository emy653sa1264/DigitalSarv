# syntax=docker/dockerfile:1.7
#
# Digital Sarv web (Vite multi-page PWA: landing /, customer /app/, courier /courier/, admin /admin/)
# served by nginx, which also reverse-proxies /api/ to the api service.
# Build context MUST be the repository root:
#   docker build -f apps/web/Dockerfile --build-arg VITE_PUBLIC_URL=https://sarv.example.ir -t digital-sarv/web .

ARG NODE_VERSION=24

# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION}-alpine AS base
ARG NPM_REGISTRY=
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    CI=1 \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
WORKDIR /repo
COPY package.json ./
RUN if [ -n "$NPM_REGISTRY" ]; then export COREPACK_NPM_REGISTRY="$NPM_REGISTRY"; fi \
 && corepack enable \
 && corepack install \
 && pnpm config set store-dir /pnpm/store \
 && if [ -n "$NPM_REGISTRY" ]; then pnpm config set registry "$NPM_REGISTRY"; fi

# ---------------------------------------------------------------------------
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm fetch

# ---------------------------------------------------------------------------
FROM deps AS build
COPY apps/api/package.json apps/api/package.json
COPY apps/web apps/web
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --offline --frozen-lockfile --filter web

# Public, build-time configuration (baked into the static bundle — never put secrets here).
# VITE_PUBLIC_URL: canonical origin of the site, e.g. https://sarv.example.ir (canonical/OG URLs, sitemap).
ARG VITE_PUBLIC_URL=
ENV VITE_PUBLIC_URL=${VITE_PUBLIC_URL}
RUN pnpm --filter web build \
 && test -f apps/web/dist/index.html

# ---------------------------------------------------------------------------
FROM nginx:1-alpine AS runtime
RUN rm -rf /usr/share/nginx/html/* /etc/nginx/conf.d/default.conf
COPY deploy/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY deploy/nginx/snippets/ /etc/nginx/snippets/
COPY --from=build /repo/apps/web/dist/ /usr/share/nginx/html/

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/healthz || exit 1
