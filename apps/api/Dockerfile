# ─────────────────────────────────────────────────────────────────────────────
# Build context: monorepo root  (docker build -f apps/api/Dockerfile .)
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1: base image ───────────────────────────────────────────────────────
FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10.22.0 --activate

# ── Stage 2: pre-fetch external packages (cache by lockfile) ──────────────────
FROM base AS fetch
WORKDIR /repo
COPY pnpm-lock.yaml ./
RUN pnpm fetch

# ── Stage 3: install all deps (workspace + fetched) ──────────────────────────
FROM fetch AS installer
COPY . .
RUN pnpm install --frozen-lockfile --offline

# ── Stage 4: build ────────────────────────────────────────────────────────────
FROM installer AS builder

# Compile workspace packages (TS → JS)
RUN pnpm --filter @welfare-ai/shared-types exec tsc
RUN pnpm --filter @welfare-ai/shared-utils exec tsc
RUN pnpm --filter @welfare-ai/ontology-schema exec tsc

# Point each package's main/types to the compiled output
RUN for pkg in shared-types shared-utils ontology-schema; do \
      sed -i \
        -e 's|"main": "./src/index.ts"|"main": "./dist/index.js"|' \
        -e 's|"types": "./src/index.ts"|"types": "./dist/index.d.ts"|' \
        packages/$pkg/package.json; \
    done

# Build the NestJS API
RUN pnpm --filter @welfare-ai/api exec nest build

# Create an isolated production deployment (resolves all prod deps)
# --legacy: pnpm v10부터 inject-workspace-packages 없이는 deploy가 거부됨
RUN pnpm --filter @welfare-ai/api deploy --legacy --prod /prod/api

# Copy the compiled dist into the deployment directory
RUN cp -r apps/api/dist /prod/api/dist

# ── Stage 5: production runner ────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Non-root user for security
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 --ingroup nodejs nestjs

COPY --from=builder --chown=nestjs:nodejs /prod/api .
COPY --chown=nestjs:nodejs apps/api/scripts/docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

USER nestjs
EXPOSE 3001
CMD ["/app/docker-entrypoint.sh"]
