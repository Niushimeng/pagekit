# Pagekit

轻量级服务发布系统。将 Git 仓库的指定分支发布为静态网站，支持 Webhook 自动更新、二维码生成。

## 功能

- 🔐 账号密码登录
- 📦 服务管理（添加、编辑、删除）
- 🚀 一键发布/取消发布
- 🔄 手动更新 / Gogs Webhook 自动更新
- 🔑 凭证管理（Git 用户名密码，可复用）
- 📱 二维码生成
- 📋 操作日志

## 技术栈

- **后端**: Node.js + Express + TypeScript
- **前端**: React + TypeScript + Vite
- **数据库**: SQLite
- **部署**: Docker + Nginx

## 快速开始

### 使用 Docker（推荐）

```bash
# 1. 编辑配置
cp config.json config.json.bak
vim config.json  # 修改 host、账号密码等

# 2. 启动
docker-compose up -d

# 3. 访问
# 管理后台: http://localhost:3000
# 已发布服务: http://localhost (Nginx)
```

### 本地开发

```bash
# 1. 安装依赖
npm install
cd client && npm install && cd ..

# 2. 编辑配置
vim config.json

# 3. 启动开发服务器
npm run dev
# 后端: http://localhost:3000
# 前端: http://localhost:5173 (自动代理 /api 到后端)
```

## 配置说明

`config.json`:

```json
{
  "port": 3000,
  "host": "https://deploy.example.com",
  "admin": {
    "username": "admin",
    "password": "change-me"
  },
  "jwtSecret": "change-this-to-a-random-string",
  "dataDir": "./data",
  "publishDir": "/data/sites",
  "tmpDir": "/data/sites/.tmp",
  "oldDir": "/data/sites/.old"
}
```

| 字段 | 说明 |
|------|------|
| `port` | 后端服务端口 |
| `host` | 对外访问地址，用于生成二维码和链接 |
| `admin` | 管理员账号密码 |
| `jwtSecret` | JWT 签名密钥 |
| `dataDir` | 数据库和缓存目录 |
| `publishDir` | 已发布文件存放目录 |
| `tmpDir` | 更新时的临时目录 |
| `oldDir` | 更新时的旧版本备份目录 |

## 工作流程

### 发布

1. 用户填写 Git 仓库地址、凭证、分支、发布目录
2. 点击"发布"
3. 系统 clone 仓库 → 拷贝发布目录 → 原子切换到发布位置
4. 自动通过 Gogs API 创建 Webhook

### 自动更新

1. 代码 push 到指定分支
2. Gogs 调用 Webhook URL
3. 系统校验 HMAC 签名 → 拉取最新代码 → 原子切换

### Nginx 配置

系统只负责将文件写入 `/data/sites/<service-name>/`，由外部 Nginx 提供 HTTP 服务。参见 `nginx.conf`。
