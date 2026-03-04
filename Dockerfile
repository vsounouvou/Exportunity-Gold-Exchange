FROM node:20-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
ARG BUILD_ID
ARG GIT_SHA
ENV BUILD_ID=$BUILD_ID
ENV GIT_SHA=$GIT_SHA
ENV SKIP_MARKETING_QUALITY_GATE=1
COPY . .
RUN npm run build

FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ARG BUILD_ID
ARG GIT_SHA
ENV BUILD_ID=$BUILD_ID
ENV GIT_SHA=$GIT_SHA

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json package-lock.json tsconfig.json env.ts ./
COPY db ./db
COPY server ./server
COPY scripts ./scripts
COPY client/src/App.tsx ./client/src/App.tsx

RUN mkdir -p /app/attached_assets
EXPOSE 5000
CMD ["node", "dist/index.js"]
