# Pagekit

轻量级服务发布系统。将 Git 仓库的指定分支发布为静态网站，支持 Webhook 自动更新、二维码生成。

## 功能

- 🔐 账号密码登录
- 📦 服务管理（添加、编辑、删除）
- 🌿 分支自动拉取（填写仓库地址和凭证后，从远程获取分支列表供选择）
- 🚀 一键发布/取消发布
- 🔄 手动更新 / Gogs Webhook 自动更新
- 🔑 凭证管理（Git 用户名密码，可复用）
- 📱 二维码生成
- 📋 操作日志
- 🤖 命令行 skill(可接入 Claude Code),通过 REST API 控制已部署实例

## 技术栈

- **后端**: Node.js + Express + TypeScript
- **前端**: React + TypeScript + Vite
- **数据库**: SQLite
- **部署**: Docker + Nginx

## 快速开始

### 使用 Docker（推荐）

```bash
# 1. 编辑 Docker 专用配置（dataDir 等路径已指向 /data 卷）
cp config.docker.json config.docker.json.bak
vim config.docker.json  # 修改 host、admin 账号密码、jwtSecret 等

# 2. 启动（首次启动会自动检测 /data/app，若无数据库则初始化并创建管理员账号）
docker-compose up -d

# 3. 访问
# 管理后台: http://localhost:3000
# 已发布服务: http://localhost (Nginx)
# 默认登录: admin / change-me（见 config.docker.json 中 admin 配置，部署前请修改）
```

首次启动时，容器会检测 `dataDir`（Docker 下为 `/data/app`）下是否存在 `pagekit.db`；若不存在则自动创建目录结构、初始化 SQLite 数据库，并在日志中输出管理员账号信息。

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
# 默认登录: admin / change-me（见 config.json 中 admin 配置）
```

本地开发时，`config.json` 中的目录路径应使用项目内相对路径（如 `./data/sites`），详见下方配置说明。

## 配置说明

`config.json` 中相对路径（以 `./` 开头）会基于项目根目录解析；绝对路径（如 Docker 中的 `/data/sites`）保持不变。

**本地开发示例：**

```json
{
  "port": 3000,
  "host": "http://localhost:3000",
  "admin": {
    "username": "admin",
    "password": "change-me"
  },
  "jwtSecret": "change-this-to-a-random-string",
  "dataDir": "./data",
  "publishDir": "./data/sites",
  "tmpDir": "./data/sites/.tmp",
  "oldDir": "./data/sites/.old"
}
```

**Docker 部署示例（见 `config.docker.json`）：**

```json
{
  "port": 3000,
  "host": "https://deploy.example.com",
  "admin": {
    "username": "admin",
    "password": "change-me"
  },
  "jwtSecret": "change-this-to-a-random-string",
  "dataDir": "/data/app",
  "publishDir": "/data/sites",
  "tmpDir": "/data/sites/.tmp",
  "oldDir": "/data/sites/.old"
}
```

| 字段 | 说明 |
|------|------|
| `port` | 后端服务端口 |
| `host` | 对外访问地址，用于生成二维码和链接 |
| `admin` | 管理员账号密码（默认 `admin` / `change-me`，部署前请修改） |
| `jwtSecret` | JWT 签名密钥 |
| `dataDir` | 数据库和 Git 缓存目录 |
| `publishDir` | 已发布文件存放目录 |
| `tmpDir` | 更新时的临时目录 |
| `oldDir` | 更新时的旧版本备份目录 |

## 工作流程

### 添加服务

1. 填写 Git 仓库地址
2. 选择凭证（Git 用户名密码）
3. 系统自动从远程拉取分支列表，选择目标分支（优先默认 `main` / `master`）
4. 可选填写发布目录（如 `dist`，留空则发布仓库根目录）

### 发布

1. 在服务列表点击「发布」
2. 系统 clone 仓库 → 拷贝发布目录 → 原子切换到发布位置
3. 自动通过 Gogs API 创建 Webhook

### 自动更新

1. 代码 push 到指定分支
2. Gogs 调用 Webhook URL
3. 系统校验 HMAC 签名 → 拉取最新代码 → 原子切换

### Nginx 配置

系统只负责将文件写入 `publishDir/<service-name>/`（Docker 下为 `/data/sites/<service-name>/`），由外部 Nginx 提供 HTTP 服务。参见 `nginx.conf`。

## 命令行控制（Claude Code Skill）

仓库内的 `skill/pagekit/` 提供一个零依赖的 `pagekit.js` 命令行封装，通过 REST API 控制一个**已部署**的 Pagekit 实例（服务发布/更新、凭证、日志、配置等），可作为 Claude Code skill 使用。

```bash
# 安装到 Claude Code skills 目录
cp -r skill/pagekit ~/.claude/skills/
chmod +x ~/.claude/skills/pagekit/pagekit.js

# 填入目标实例地址（仅 host，不保存账号密码）
vim ~/.claude/skills/pagekit/config.json

# 使用
node ~/.claude/skills/pagekit/pagekit.js service list
```

**认证模型**：不保存账号密码。首次操作时脚本启动本地服务并打开浏览器到 Pagekit 登录页，用户登录后浏览器把一个**免过期 JWT** 重定向回本地脚本并缓存到 `~/.cache/pagekit/token.json`，后续操作复用该 token；遇 401 自动重新登录一次。回调地址仅接受 loopback（`127.0.0.1`/`localhost`/`[::1]`）并带随机 `state` 防伪造。无头/CI 环境可用环境变量 `PAGEKIT_TOKEN` 直接注入已有 token。

要作废已泄漏的 token，需在服务端轮换 `config.jwtSecret` 并重启（会同时使所有 web/CLI token 失效）。完整命令参考见 `skill/pagekit/SKILL.md` 与 `reference.md`。
