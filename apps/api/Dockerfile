# Build context is the monorepo root (npm workspaces share one lockfile there).
FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY apps ./apps
RUN npm ci
WORKDIR /app/apps/api
RUN npx prisma generate
RUN npm run build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl tini && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY apps ./apps
RUN npm ci --omit=dev
WORKDIR /app/apps/api
COPY --from=build /app/apps/api/dist ./dist
RUN npx prisma generate
EXPOSE 3000
# tini is PID 1 so SIGTERM reaches node (via exec) and zombies are reaped.
# NODE_OPTIONS caps the heap below the container limit; tune with the VPS memory.
ENV NODE_OPTIONS=--max-old-space-size=384
ENTRYPOINT ["tini", "--"]
CMD ["sh", "-c", "npx prisma migrate deploy && (node dist/scripts/seed-skills-catalog.js || echo 'skills catalog seed failed') && exec node dist/main"]
