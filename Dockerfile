# 构建阶段：在 debian:13-slim 上编译服务端与前端
FROM debian:13-slim AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    git python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# 从官方 Node 镜像复制运行时，避免 NodeSource 对 Debian 13 的兼容问题
COPY --from=node:20-bookworm-slim /usr/local /usr/local
ENV PATH="/usr/local/bin:$PATH"

WORKDIR /app

# 安装服务端依赖（better-sqlite3 等原生模块需在此阶段编译）
COPY package.json package-lock.json* ./
RUN npm ci --production

COPY tsconfig.server.json ./
COPY server/ ./server/
RUN npx tsc -p tsconfig.server.json

# 构建前端
COPY client/package.json client/package-lock.json* ./client/
RUN cd client && npm ci
COPY client/ ./client/
RUN cd client && npm run build

# 运行阶段：Nginx + Node 同容器
FROM debian:13-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    nginx git ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && rm -f /etc/nginx/sites-enabled/default

COPY --from=node:20-bookworm-slim /usr/local /usr/local
ENV PATH="/usr/local/bin:$PATH"

WORKDIR /app

COPY --from=builder /app/dist-server ./dist-server
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/client/dist ./client/dist
COPY --from=builder /app/package.json ./

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

RUN mkdir -p /data/sites /data/app

ENV NODE_ENV=production

EXPOSE 80 3000

ENTRYPOINT ["docker-entrypoint.sh"]
