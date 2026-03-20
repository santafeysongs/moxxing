FROM node:22-slim

RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy monorepo root
COPY package.json package-lock.json ./
COPY apps/api ./apps/api
COPY packages ./packages

# Install all deps
RUN npm ci --workspace=apps/api --include-workspace-root

# Build shared packages
RUN cd packages/shared && npx tsc || true
RUN cd packages/graph-db && npx tsc || true
RUN cd packages/analysis-engine && npx tsc || true

EXPOSE 4000

ENV PORT=4000
ENV HOST=0.0.0.0

CMD ["npx", "ts-node", "--transpile-only", "apps/api/src/index.ts"]
