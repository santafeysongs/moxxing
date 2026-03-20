FROM node:22-slim

RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy everything
COPY . .

# Install all dependencies (monorepo workspaces)
RUN npm ci || npm install

# Build shared packages that the API depends on
RUN cd packages/shared && npx tsc || true
RUN cd packages/graph-db && npx tsc || true
RUN cd packages/analysis-engine && npx tsc || true

EXPOSE 4000

ENV PORT=4000
ENV HOST=0.0.0.0

WORKDIR /app/apps/api

CMD ["npx", "ts-node", "--transpile-only", "src/index.ts"]
