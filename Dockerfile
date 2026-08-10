# BioTrace API (monorepo slice: api + messages)
FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/
COPY packages/messages/package.json packages/messages/

RUN pnpm install --frozen-lockfile --filter @biotrace/api...

COPY packages/messages packages/messages
COPY apps/api apps/api

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8787 \
    DATABASE_URL=file:/data/biotrace.db \
    UPLOAD_DIR=/data/uploads

EXPOSE 8787

CMD ["pnpm", "--filter", "@biotrace/api", "start"]
