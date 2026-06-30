#!/bin/sh
set -e

# 检测 /data 下是否已有数据库，没有则自动初始化并写入初始管理员信息
node /app/dist-server/init.js

# 启动 Nginx（后台守护进程，对外提供静态站点与 API 反向代理）
nginx

# 前台运行 Pagekit 管理后台服务
exec node /app/dist-server/index.js
