FROM node:22-bookworm-slim AS build
RUN corepack enable && corepack prepare pnpm@12 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:22-bookworm-slim
RUN corepack enable && corepack prepare pnpm@12 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile
# server/ imports src/gen and src/lib (the world generator and the viewport maths), plugins/ import server/
COPY server ./server
COPY plugins ./plugins
COPY src/gen ./src/gen
COPY src/lib ./src/lib
COPY sitegarden.yaml ./
COPY --from=build /app/dist ./dist
RUN mkdir /data && chown node:node /data
USER node
ENV HOST=127.0.0.1 SITEGARDEN_DATA=/data PORT=8787 UV_THREADPOOL_SIZE=16
VOLUME /data
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD ["node","-e","fetch('http://127.0.0.1:8787/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node","--import","tsx","server/index.ts"]
