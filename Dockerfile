FROM node:24.19.0-bookworm-slim@sha256:3638d9a6fe4030bd716be989438248074489337ba3275657f93595428be4fc03 AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS prod-deps
RUN npm prune --omit=dev

FROM deps AS build
ARG BUILD_ID
ARG GIT_SHA
ARG GIT_DIRTY
ARG SOURCE_VERSION
ARG APP_NAME
ARG TENANT_DEFAULT
ARG DEPLOY_TENANT
ARG PUBLIC_BASE_URL
ARG APP_BASE_URL
ARG PASSWORD_SETUP_BASE_URL
ENV BUILD_ID=$BUILD_ID
ENV GIT_SHA=$GIT_SHA
ENV GIT_DIRTY=$GIT_DIRTY
ENV SOURCE_VERSION=$SOURCE_VERSION
ENV APP_NAME=$APP_NAME
ENV TENANT_DEFAULT=$TENANT_DEFAULT
ENV DEPLOY_TENANT=$DEPLOY_TENANT
ENV PUBLIC_BASE_URL=$PUBLIC_BASE_URL
ENV APP_BASE_URL=$APP_BASE_URL
ENV PASSWORD_SETUP_BASE_URL=$PASSWORD_SETUP_BASE_URL
ENV SKIP_PUBLIC_SURFACE_QUALITY_GATE=1
COPY . .
RUN npm run build

FROM node:24.19.0-bookworm-slim@sha256:3638d9a6fe4030bd716be989438248074489337ba3275657f93595428be4fc03 AS runner
WORKDIR /app
ENV NODE_ENV=production
ARG BUILD_ID
ARG GIT_SHA
ARG GIT_DIRTY
ARG SOURCE_VERSION
ARG APP_NAME
ARG TENANT_DEFAULT
ARG DEPLOY_TENANT
ARG PUBLIC_BASE_URL
ARG APP_BASE_URL
ARG PASSWORD_SETUP_BASE_URL
ENV BUILD_ID=$BUILD_ID
ENV GIT_SHA=$GIT_SHA
ENV GIT_DIRTY=$GIT_DIRTY
ENV SOURCE_VERSION=$SOURCE_VERSION
ENV APP_NAME=$APP_NAME
ENV TENANT_DEFAULT=$TENANT_DEFAULT
ENV DEPLOY_TENANT=$DEPLOY_TENANT
ENV PUBLIC_BASE_URL=$PUBLIC_BASE_URL
ENV APP_BASE_URL=$APP_BASE_URL
ENV PASSWORD_SETUP_BASE_URL=$PASSWORD_SETUP_BASE_URL

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
RUN if [ "$DEPLOY_TENANT" = "boursedelor" ] || [ "$APP_NAME" = "boursedelor" ]; then \
      find /app/dist/public/tenants -mindepth 1 -maxdepth 1 ! -name bdo -exec rm -rf {} + 2>/dev/null || true; \
      rm -rf /app/dist/public/met \
        /app/dist/public/zogueland \
        /app/dist/public/brand/zogueland \
        /app/dist/public/manifest-zogueland.webmanifest; \
    fi
COPY package.json package-lock.json tsconfig.json drizzle.config.ts env.ts ./
COPY db ./db
COPY server ./server
COPY scripts ./scripts
COPY tenants ./tenants
COPY client/src/App.tsx ./client/src/App.tsx

RUN node --no-warnings --experimental-vm-modules scripts/verify-production-runtime-deps.mjs
RUN mkdir -p /app/attached_assets
EXPOSE 5000
CMD ["node", "dist/index.js"]
