# pagekit 命令参考

所有命令前缀为 `pagekit`(即 `node pagekit.js`)。`<id>` 为服务或凭证 ID;`stdin` 表示从管道读入 JSON。

## 认证

不保存账号密码。首次操作(或显式 `pagekit login`)时脚本启动本地服务、打开浏览器到 Pagekit 登录页;用户在网页登录后,浏览器把一个**免过期 JWT** 重定向回本地脚本并缓存于 `~/.cache/pagekit/token.json`。

- 安全:回调地址仅接受 `http://127.0.0.1` / `localhost` / `[::1]`(loopback),并带随机 `state` 防伪造。
- 401:自动清缓存并重新走一次浏览器登录;仍 401 则报错(多为服务端轮换了 `jwtSecret`)。
- 作废泄漏 token:在服务端轮换 `config.jwtSecret` 并重启(同时使所有 web/CLI token 失效)。`pagekit logout` 仅清本地缓存。
- 无头/CI:用环境变量 `PAGEKIT_TOKEN` 直接注入已有 token,跳过浏览器。

| 子命令 | 签名 | 说明 |
|--------|------|------|
| `login` | `login` | 打开浏览器登录,刷新缓存的 token |
| `logout` | `logout` | 清除本地缓存的 token |

## service

| 子命令 | 签名 | 输入 | 对应 API | 说明 |
|--------|------|------|----------|------|
| `list` | `service list [--full]` | — | `GET /api/services` | 默认精简为 `{id,name,sourceType,status,updatedAt}`;`--full` 返回完整对象 |
| `get` | `service get <id>` | — | `GET /api/services/:id` | 完整对象 |
| `create` | `service create` | stdin JSON | `POST /api/services` | 见下方 body 字段表 |
| `edit` | `service edit <id>` | stdin JSON | `PUT /api/services/:id` | 配置改动(非文件版本更新) |
| `delete` | `service delete <id>` | — | `DELETE /api/services/:id` | |
| `publish` | `service publish <id>` | — | `POST /api/services/:id/publish` | |
| `unpublish` | `service unpublish <id>` | — | `POST /api/services/:id/unpublish` | |
| `update` | `service update <id>` | — | `POST /api/services/:id/update` | 更新文件版本(git 拉取 / zip 重解压) |
| `logs` | `service logs <id>` | — | `GET /api/services/:id/logs` | 该服务的操作日志 |
| `qrcode` | `service qrcode <id>` | — | `GET /api/services/:id/qrcode` | 输出二维码图片二进制 |
| `qrcode-url` | `service qrcode-url <id>` | — | `GET /api/services/:id/qrcode-url` | 返回二维码 URL |
| `branches` | `service branches --repo <url> --credential <id>` | flags | `GET /api/services/branches?git_url=&credential_id=` | 创建 git 服务前选分支 |
| `trigger-webhook` | `service trigger-webhook <id>` | — | `POST /api/webhook/:id/:secret` | 读取服务的 `webhook_secret` 模拟一次 webhook 触发 |

### service create / edit body 字段表

字段名按 API 原始 **snake_case**(脚本原样透传 body,请直接用下列字段名)。

| 字段 | create | edit | 类型 | 说明 |
|------|:------:|:----:|------|------|
| `name` | ✅ 必填 | 可选 | string | 仅字母/数字/下划线/连字符;唯一 |
| `source_type` | 可选(默认 `git`) | ❌ 不可改 | `"git"` \| `"zip"` | 来源类型 |
| `git_url` | git 必填 | git 可选 | string | 仓库地址 |
| `credential_id` | git 必填 | git 可选 | string | 引用凭证 ID |
| `branch` | git 可选 | git 可选 | string | 分支名 |
| `publish_dir` | 可选 | 可选 | string | 源码树内子目录,空则根目录 |
| `auto_update_enabled` | git 可选 | git 可选 | boolean | 是否开启定时更新 |
| `auto_update_interval` | git 可选 | git 可选 | number | 定时更新间隔(分钟,1–1440,默认 1) |

> zip 服务忽略所有 git 字段。`edit` 只传需要改的字段即可。

## archive

| 子命令 | 签名 | 对应 API | 说明 |
|--------|------|----------|------|
| `upload` | `archive upload <id> <file>` | `POST /api/services/:id/archive` | multipart 字段名 `archive`;仅 zip 服务;默认大小限制见服务端 `maxArchiveSize` |

## credential

| 子命令 | 签名 | 输入 | 对应 API |
|--------|------|------|----------|
| `list` | `credential list` | — | `GET /api/credentials` |
| `create` | `credential create` | stdin JSON | `POST /api/credentials` |
| `edit` | `credential edit <id>` | stdin JSON | `PUT /api/credentials/:id` |
| `delete` | `credential delete <id>` | — | `DELETE /api/credentials/:id` |

credential body 字段:`name`、`username`、`password`。

## log

| 子命令 | 签名 | 对应 API |
|--------|------|----------|
| `list` | `log list` | `GET /api/logs` |

## config

| 子命令 | 签名 | 输入 | 对应 API |
|--------|------|------|----------|
| `get` | `config get` | — | `GET /api/config` |
| `set` | `config set` | stdin JSON | `PUT /api/config` |

## raw(逃生口)

```
pagekit raw <method> <path> [json]
```

- `method`:HTTP 方法(`GET`/`POST`/`PUT`/`DELETE`)
- `path`:以 `/api/` 开头的路径
- body:第三参数或 stdin(任选其一)

## 退出码

`0` 成功 / `1` 认证 / `2` 用法 / `3` 网络 / `4+` = HTTP 状态码(截断 255)。
