---
name: pagekit
description: 控制 Pagekit 静态站点发布系统——管理服务、发布/取消发布/更新文件版本、凭证、日志与配置。当用户要操作一个已部署的 Pagekit 实例时使用。
---

# Pagekit 控制 Skill

## 这是什么

Pagekit 是一个轻量级静态站点发布系统:把 Git 仓库分支或上传的 zip 包发布为静态网站,支持 Webhook 自动更新、二维码生成。本 skill 通过 `pagekit` 脚本调用其 REST API,控制一个**已部署**的 Pagekit 实例。

## 安装与配置

```bash
cp -r skill/pagekit ~/.claude/skills/
chmod +x ~/.claude/skills/pagekit/pagekit.js
```

编辑 `~/.claude/skills/pagekit/config.json`,填入目标实例的 `host`。也可用环境变量覆盖:`PAGEKIT_HOST`。

**认证不保存账号密码。** 首次操作(或显式 `pagekit login`)时,脚本会启动本地服务并打开浏览器到 Pagekit 登录页;用户在网页登录后,浏览器自动把一个**免过期 JWT** 重定向回本地脚本并缓存到 `~/.cache/pagekit/token.json`,后续操作复用该 token。token 遇 401 会自动重新走一次浏览器登录。无头/CI 环境可用环境变量 `PAGEKIT_TOKEN` 直接注入已有 token,跳过浏览器。

脚本调用前缀示例(下文直接写 `pagekit ...`):

```bash
node ~/.claude/skills/pagekit/pagekit.js service list
```

## 核心概念(领域语言)

- **Service 服务**:一个可独立发布的静态资源来源。按 **Source Type** 分 `git` 与 `zip` 两种,创建后不可更改。
- **Publish 发布** / **Unpublish 取消发布**:切换服务是否在线(`status: published` / `unpublished`)。
- **Update 更新**:替换在线文件为新版本(git 拉取 / zip 重解压),与配置改动是两回事。
- **Credential 凭证**:复用的 Git 用户名+密码,仅 git 服务引用。
- **Stored Archive 存档包**:zip 服务的最新上传 zip,**发布前必须先上传**。
- **Scheduled Update 定时更新**:git 服务的可选周期拉取。

术语全文见项目 `CONTEXT.md`。

## 典型流程

### 发布一个 Git 服务(四步)

```bash
# 1. 创建凭证(stdin JSON)
echo '{"name":"my-cred","username":"gituser","password":"gitpass"}' | pagekit credential create
# → 拿 credentialId

# 2. 拉取远程分支列表
pagekit service branches --repo https://gogs.example.com/repo.git --credential <credentialId>
# → 选定 branch

# 3. 创建服务(stdin JSON)
echo '{"name":"mysite","source_type":"git","git_url":"https://...","credential_id":"<id>","branch":"main","publish_dir":"dist"}' | pagekit service create
# → 拿 serviceId

# 4. 发布
pagekit service publish <serviceId>
```

### 发布一个 Zip 服务(三步)

```bash
# 1. 创建(zip 类型,无需 git 字段)
echo '{"name":"mysite","source_type":"zip"}' | pagekit service create
# → 拿 serviceId

# 2. 上传存档包(必须先于 publish)
pagekit archive upload <serviceId> ./site.zip

# 3. 发布
pagekit service publish <serviceId>
```

> ⚠️ Zip 服务**必须先 `archive upload` 再 publish**,否则 publish 会因无存档包而失败。

> ✅ **发布或更新成功后,必须直接向用户展示访问地址和二维码**,不要只回一句"发布/更新成功"。`publish` 与 `update` 接口仅返回 `{success:true, message}`,不含地址,因此成功后立即追加一步:
>
> ```bash
> pagekit service qrcode-url <serviceId>
> # → { "url": "https://<host>/<service-name>" }  —— 这个 url 就是访问地址,二维码编码的也是它
> ```
>
> 然后向用户输出两样东西:
> 1. **访问地址**:上面返回的 `url`(也可由 `${config.host}/${service.name}` 自行拼出);
> 2. **二维码**:用 `pagekit service qrcode <serviceId>` 获取 PNG 二进制(可保存为文件或用二维码渲染工具展示),或直接把访问地址转成二维码。
>
> 此规则对 `service publish`、`service update`、`service trigger-webhook`(触发后产生新版本)均适用。

### 日常操作

| 任务 | 命令 |
|------|------|
| 列出服务(精简) | `pagekit service list` |
| 列出服务(完整) | `pagekit service list --full` |
| 查看详情 | `pagekit service get <id>` |
| 更新文件版本 | `pagekit service update <id>`(成功后展示访问地址+二维码,见上文 ✅) |
| 改配置(发布目录等) | `echo '{...}' \| pagekit service edit <id>` |
| 取消发布 | `pagekit service unpublish <id>` |
| 删除服务 | `pagekit service delete <id>` |
| 查看服务日志 | `pagekit service logs <id>` |
| 获取二维码 URL | `pagekit service qrcode-url <id>` |
| 获取二维码图片 | `pagekit service qrcode <id>` |
| 模拟 webhook 触发更新 | `pagekit service trigger-webhook <id>` |
| 查看全局操作日志 | `pagekit log list` |

## 退出码与错误

| 退出码 | 含义 |
|--------|------|
| 0 | 成功 |
| 1 | 认证失败(token 失效且重新登录后仍 401,多为服务端轮换了 jwtSecret) |
| 2 | 用法错误(参数缺失) |
| 3 | 网络错误(连不上 host) |
| 4+ | HTTP 状态码(截断 255),stderr 输出 API 原始错误体 |

token 缓存于 `~/.cache/pagekit/token.json`,免过期;`pagekit logout` 清除缓存。要真正作废已泄漏的 token,需在服务端轮换 `config.jwtSecret` 并重启(会同时使所有 web/CLI token 失效)。

## 认证子命令

| 命令 | 说明 |
|------|------|
| `pagekit login` | 打开浏览器登录,刷新缓存的 token |
| `pagekit logout` | 清除本地缓存的 token |

## 逃生口

未封装的端点可用 `raw` 任意调用:

```bash
pagekit raw GET /api/config
echo '{"maxArchiveSize":104857600}' | pagekit raw PUT /api/config
```

## 完整命令参考

见同目录 `reference.md`(每条子命令的签名、stdin/flags、对应 API、body 字段表)。
