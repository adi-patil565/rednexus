# Build context is the repo ROOT, not backend/ — the API imports shared
# workspace packages (@rednexus/validators, @rednexus/types).
#
#   docker build -f backend/Dockerfile .

FROM node:22-alpine

WORKDIR /app

# OpenSSL is required by Prisma's query engine on Alpine.
RUN apk add --no-cache openssl

# Copy manifests first so `npm ci` is cached independently of source.
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY packages/api/package.json ./packages/api/
COPY packages/types/package.json ./packages/types/
COPY packages/utils/package.json ./packages/utils/
COPY packages/store/package.json ./packages/store/
COPY packages/validators/package.json ./packages/validators/
COPY packages/design-tokens/package.json ./packages/design-tokens/

RUN npm ci --omit=dev --workspace=@rednexus/backend --include-workspace-root

COPY packages/ ./packages/
COPY backend/ ./backend/

# Generate the Prisma client after the schema is present.
# Guarded so the image still builds before Stage 3 adds the schema.
RUN if [ -f backend/prisma/schema.prisma ]; then \
      npx prisma generate --schema=backend/prisma/schema.prisma; \
    fi

EXPOSE 8000

# Fails the container if the health endpoint stops responding.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:8000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "backend/src/server.js"]
