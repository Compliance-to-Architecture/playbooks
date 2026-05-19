# =============================================================================
# Coding Engine — Production Dockerfile
# =============================================================================
# Multi-stage build: builder (compile) -> runner (minimal runtime)
#
# Build:  docker build -t iof/code-engine -f apps/code-engine/Dockerfile .
# Run:    docker run -p 3100:3100 --env-file .env iof/code-engine
# =============================================================================

# Stage 1: Build
FROM node:22-alpine AS builder

RUN apk add --no-cache libc6-compat \
 && corepack enable && corepack prepare pnpm@9.14.2 --activate

WORKDIR /app

# Copy workspace config
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY apps/code-engine/package.json ./apps/code-engine/

RUN pnpm install --frozen-lockfile --filter @iof/code-engine

# Copy source
COPY apps/code-engine/ ./apps/code-engine/

# Build TypeScript
RUN cd apps/code-engine && pnpm tsc

# ---------------------------------------------------------------------------
# Stage 2: Production runtime
# ---------------------------------------------------------------------------
FROM node:22-alpine AS runner

RUN apk add --no-cache dumb-init \
 && addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 engine

WORKDIR /app
ENV NODE_ENV=production

LABEL org.opencontainers.image.title="IOF Coding Engine" \
      org.opencontainers.image.description="Portable AI Coding Engine — failure pipeline, agent orchestrator, compliance engine" \
      org.opencontainers.image.vendor="Islamic Open Finance" \
      org.opencontainers.image.source="https://github.com/Islamic-Open-Finance/app" \
      org.opencontainers.image.licenses="Apache-2.0"

# Copy built artifacts
COPY --from=builder --chown=engine:nodejs /app/apps/code-engine/dist ./dist
COPY --from=builder --chown=engine:nodejs /app/apps/code-engine/package.json ./
COPY --from=builder --chown=engine:nodejs /app/apps/code-engine/skills ./skills
COPY --from=builder --chown=engine:nodejs /app/apps/code-engine/agents ./agents
COPY --from=builder --chown=engine:nodejs /app/apps/code-engine/templates ./templates
COPY --from=builder --chown=engine:nodejs /app/apps/code-engine/examples ./examples

# Install production deps only (optional deps for Redis/CodeMode)
RUN corepack enable && corepack prepare pnpm@9.14.2 --activate \
 && pnpm install --prod --no-frozen-lockfile 2>/dev/null || true

USER engine

EXPOSE 3100

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3100/health || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/core/server/http-server.js"]
