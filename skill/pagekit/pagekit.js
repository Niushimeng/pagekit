#!/usr/bin/env node
'use strict';

// pagekit — 控制 Pagekit 静态站点发布系统的命令行封装。
// 零依赖,仅使用 Node 内置模块。首次操作时通过浏览器登录拿免过期 JWT 并缓存,
// 不保存任何账号密码。

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { exec } = require('child_process');

// 退出码约定
const EXIT = { OK: 0, AUTH: 1, USAGE: 2, NETWORK: 3 };

// 浏览器登录流程最长等待时间
const LOGIN_TIMEOUT_MS = 5 * 60 * 1000;
const CACHE_DIR = path.join(os.homedir(), '.cache', 'pagekit');
const TOKEN_FILE = path.join(CACHE_DIR, 'token.json');

// ---------------------------------------------------------------------------
// 工具
// ---------------------------------------------------------------------------

function die(code, msg) {
  if (msg) process.stderr.write(msg + '\n');
  process.exit(code);
}

function loadConfig() {
  const host = process.env.PAGEKIT_HOST;
  const token = process.env.PAGEKIT_TOKEN || undefined;
  const cfgPath = path.join(__dirname, 'config.json');
  let file = {};
  try {
    file = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  } catch (e) {
    die(EXIT.USAGE, `无法读取配置: ${cfgPath}\n请填写 host(或设置环境变量 PAGEKIT_HOST)。\n错误: ${e.message}`);
  }
  return {
    host: (host || file.host || '').replace(/\/$/, ''),
    // 可选:直接注入已有 token,跳过浏览器登录(无头/CI 场景)
    token: token || file.token || undefined,
  };
}

// 读 stdin 为字符串
function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    if (process.stdin.isTTY) {
      resolve('');
      return;
    }
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => (data += c));
    process.stdin.on('end', () => resolve(data));
  });
}

function parseJsonStdin(raw) {
  if (!raw || !raw.trim()) {
    die(EXIT.USAGE, '缺少 stdin JSON 输入。通过管道传入 JSON 对象。');
  }
  try {
    return JSON.parse(raw);
  } catch (e) {
    die(EXIT.USAGE, `stdin 不是合法 JSON: ${e.message}`);
  }
}

function print(obj) {
  if (obj === undefined || obj === null || obj === '') {
    process.stdout.write(JSON.stringify({ ok: true }) + '\n');
    return;
  }
  process.stdout.write(JSON.stringify(obj, null, 2) + '\n');
}

// snake_case → camelCase
function camel(s) {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

// 精简服务列表字段
function slimService(s) {
  return {
    id: s.id,
    name: s.name,
    sourceType: s.source_type,
    status: s.status,
    updatedAt: s.updated_at,
  };
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

function httpRequest(method, url, { body, headers } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const opts = {
      method,
      hostname: u.hostname,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + u.search,
      headers: headers || {},
    };
    if (body && !opts.headers['Content-Length']) {
      const buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
      opts.headers['Content-Length'] = buf.length;
    }
    const req = lib.request(opts, (res) => {
      let chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        resolve({ status: res.statusCode, headers: res.headers, body: buf });
      });
    });
    req.on('error', (e) => reject(e));
    if (body) req.write(body);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// 认证
// ---------------------------------------------------------------------------

// 缓存的 token 不带过期时间(CLI token 免过期),存在即复用
function readCachedToken() {
  try {
    const t = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
    if (t.token) return t.token;
  } catch (_) {}
  return null;
}

function writeCachedToken(token) {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(TOKEN_FILE, JSON.stringify({ token }));
  } catch (_) {}
}

function clearCachedToken() {
  try { fs.unlinkSync(TOKEN_FILE); } catch (_) {}
}

// 在默认浏览器打开 URL;失败返回 false(调用方负责打印 URL 让用户手动打开)
function openBrowser(url) {
  const cmds = {
    darwin: 'open',
    win32: 'start ""',
  };
  const base = cmds[process.platform] || 'xdg-open';
  return new Promise((resolve) => {
    exec(`${base} "${url}"`, (err) => resolve(!err));
  });
}

// 浏览器登录:启动本地 loopback 服务,引导用户在 Pagekit 网页登录,
// 登录成功后网页重定向回本地带回免过期 CLI token。
function browserLogin(cfg) {
  return new Promise((resolve, reject) => {
    const state = crypto.randomBytes(16).toString('hex');
    let settled = false;

    const server = http.createServer((req, res) => {
      const u = new URL(req.url, 'http://127.0.0.1');
      if (u.pathname !== '/cb') {
        res.writeHead(404); res.end('not found');
        return;
      }
      const token = u.searchParams.get('token');
      const returnedState = u.searchParams.get('state');
      if (returnedState !== state || !token) {
        res.writeHead(400);
        res.end('<html><body>state 校验失败,请重新运行 pagekit login。</body></html>');
        if (!settled) { settled = true; server.close(); reject(new Error('state 校验失败')); }
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<html><body><h2>登录成功</h2><p>可关闭此页面并回到终端。</p></body></html>');
      if (!settled) {
        settled = true;
        server.close();
        resolve(token);
      }
    });

    server.on('error', (e) => {
      if (!settled) { settled = true; reject(e); }
    });

    server.listen(0, '127.0.0.1', async () => {
      const port = server.address().port;
      const redirectUri = `http://127.0.0.1:${port}/cb`;
      const loginUrl = `${cfg.host}/login?redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;

      process.stderr.write(`正在打开浏览器登录: ${cfg.host}/login\n`);
      const opened = await openBrowser(loginUrl);
      if (!opened) {
        process.stderr.write(`\n无法自动打开浏览器。请在浏览器手动打开:\n  ${loginUrl}\n`);
        process.stderr.write(`(远程机器可用 SSH 端口转发: ssh -L ${port}:127.0.0.1:${port} ...)\n\n`);
      }
      process.stderr.write(`等待登录完成(最长 ${Math.round(LOGIN_TIMEOUT_MS / 1000)}s)...\n`);
    });

    // 超时保护,避免无头/无人值守时永久挂起
    setTimeout(() => {
      if (!settled) {
        settled = true;
        server.close();
        reject(new Error('浏览器登录超时'));
      }
    }, LOGIN_TIMEOUT_MS).unref();
  });
}

async function login(cfg) {
  const token = await browserLogin(cfg);
  writeCachedToken(token);
  return token;
}

async function getToken(cfg) {
  // 1) 环境变量直接注入的 token(无头/CI)
  if (cfg.token) return cfg.token;
  // 2) 缓存的免过期 token
  return readCachedToken() || login(cfg);
}

// 带认证的请求,401 自动重登一次
async function apiRequest(cfg, method, apiPath, { body, headers, raw } = {}) {
  const baseHeaders = Object.assign({}, headers || {});
  const isJson = body && !(body instanceof Multipart);
  if (isJson) baseHeaders['Content-Type'] = 'application/json';
  let token = await getToken(cfg);
  baseHeaders['Authorization'] = `Bearer ${token}`;
  if (body instanceof Multipart) {
    baseHeaders['Content-Type'] = body.contentType();
    body = body.buffer();
  }
  let resp = await httpRequest(method, `${cfg.host}${apiPath}`, { body, headers: baseHeaders });
  if (resp.status === 401) {
    // 环境变量注入的 token 无缓存可清,且无法走浏览器重登;直接报错
    if (cfg.token) {
      die(EXIT.AUTH, '认证失败:PAGEKIT_TOKEN 无效或已失效。请更新该环境变量或改用浏览器登录。');
    }
    clearCachedToken();
    token = await login(cfg);
    baseHeaders['Authorization'] = `Bearer ${token}`;
    resp = await httpRequest(method, `${cfg.host}${apiPath}`, { body, headers: baseHeaders });
    if (resp.status === 401) {
      die(EXIT.AUTH, '认证失败:重新登录后仍 401。可能 jwtSecret 已轮换,请检查服务端。');
    }
  }
  if (resp.status >= 400) {
    die(resp.status, resp.body.toString());
  }
  if (raw) return resp;
  if (!resp.body.length) return { ok: true };
  try { return JSON.parse(resp.body); } catch (_) { return { ok: true, raw: resp.body.toString() }; }
}

// ---------------------------------------------------------------------------
// multipart(无依赖)
// ---------------------------------------------------------------------------

class Multipart {
  constructor() {
    this.boundary = '----pagekit' + crypto.randomBytes(8).toString('hex');
    this.parts = [];
  }
  addFile(fieldName, filename, buf) {
    const head = `--${this.boundary}\r\nContent-Disposition: form-data; name="${fieldName}"; filename="${filename}"\r\nContent-Type: application/zip\r\n\r\n`;
    this.parts.push(Buffer.from(head, 'utf8'));
    this.parts.push(buf);
    this.parts.push(Buffer.from('\r\n', 'utf8'));
  }
  contentType() { return `multipart/form-data; boundary=${this.boundary}`; }
  buffer() {
    this.parts.push(Buffer.from(`--${this.boundary}--\r\n`, 'utf8'));
    return Buffer.concat(this.parts);
  }
}

// ---------------------------------------------------------------------------
// 子命令
// ---------------------------------------------------------------------------

function requireArgs(args, n, usage) {
  if (args.length < n) die(EXIT.USAGE, `参数不足。用法: ${usage}`);
}

function parseFlags(args) {
  const flags = {};
  const rest = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      const val = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true;
      flags[key] = val;
    } else {
      rest.push(args[i]);
    }
  }
  return { flags, rest };
}

async function cmdService(cfg, args) {
  const sub = args[0];
  const rest = args.slice(1);
  switch (sub) {
    case 'list': {
      const { flags } = parseFlags(rest);
      const data = await apiRequest(cfg, 'GET', '/api/services');
      print(flags.full ? data : (Array.isArray(data) ? data.map(slimService) : data));
      return;
    }
    case 'get': {
      requireArgs(rest, 1, 'pagekit service get <id>');
      print(await apiRequest(cfg, 'GET', `/api/services/${rest[0]}`));
      return;
    }
    case 'create': {
      const body = parseJsonStdin(await readStdin());
      print(await apiRequest(cfg, 'POST', '/api/services', { body: JSON.stringify(body) }));
      return;
    }
    case 'edit': {
      requireArgs(rest, 1, 'pagekit service edit <id>  (配置改动走 stdin JSON)');
      const body = parseJsonStdin(await readStdin());
      print(await apiRequest(cfg, 'PUT', `/api/services/${rest[0]}`, { body: JSON.stringify(body) }));
      return;
    }
    case 'delete': {
      requireArgs(rest, 1, 'pagekit service delete <id>');
      print(await apiRequest(cfg, 'DELETE', `/api/services/${rest[0]}`));
      return;
    }
    case 'publish': {
      requireArgs(rest, 1, 'pagekit service publish <id>');
      print(await apiRequest(cfg, 'POST', `/api/services/${rest[0]}/publish`));
      return;
    }
    case 'unpublish': {
      requireArgs(rest, 1, 'pagekit service unpublish <id>');
      print(await apiRequest(cfg, 'POST', `/api/services/${rest[0]}/unpublish`));
      return;
    }
    case 'update': {
      requireArgs(rest, 1, 'pagekit service update <id>  (更新文件版本)');
      print(await apiRequest(cfg, 'POST', `/api/services/${rest[0]}/update`));
      return;
    }
    case 'logs': {
      requireArgs(rest, 1, 'pagekit service logs <id>');
      print(await apiRequest(cfg, 'GET', `/api/services/${rest[0]}/logs`));
      return;
    }
    case 'qrcode': {
      requireArgs(rest, 1, 'pagekit service qrcode <id>');
      const resp = await apiRequest(cfg, 'GET', `/api/services/${rest[0]}/qrcode`, { raw: true });
      process.stdout.write(resp.body);
      return;
    }
    case 'qrcode-url': {
      requireArgs(rest, 1, 'pagekit service qrcode-url <id>');
      print(await apiRequest(cfg, 'GET', `/api/services/${rest[0]}/qrcode-url`));
      return;
    }
    case 'branches': {
      const { flags } = parseFlags(rest);
      if (!flags.repo || !flags.credential) {
        die(EXIT.USAGE, '用法: pagekit service branches --repo <url> --credential <id>');
      }
      const qs = `?git_url=${encodeURIComponent(flags.repo)}&credential_id=${encodeURIComponent(flags.credential)}`;
      print(await apiRequest(cfg, 'GET', `/api/services/branches${qs}`));
      return;
    }
    case 'trigger-webhook': {
      requireArgs(rest, 1, 'pagekit service trigger-webhook <id>');
      const svc = await apiRequest(cfg, 'GET', `/api/services/${rest[0]}`);
      const secret = svc.webhook_secret;
      if (!secret) die(EXIT.USAGE, '该服务未配置 webhook secret(webhook_secret 字段为空)。');
      print(await apiRequest(cfg, 'POST', `/api/webhook/${rest[0]}/${secret}`));
      return;
    }
    default:
      die(EXIT.USAGE, `未知 service 子命令: ${sub}\n可用: list get create edit delete publish unpublish update logs qrcode qrcode-url branches trigger-webhook`);
  }
}

async function cmdArchive(cfg, args) {
  const sub = args[0];
  if (sub !== 'upload') die(EXIT.USAGE, '用法: pagekit archive upload <id> <file>');
  const rest = args.slice(1);
  requireArgs(rest, 2, 'pagekit archive upload <id> <file>');
  const [id, file] = rest;
  if (!fs.existsSync(file)) die(EXIT.USAGE, `文件不存在: ${file}`);
  const buf = fs.readFileSync(file);
  const mp = new Multipart();
  mp.addFile('archive', path.basename(file), buf);
  print(await apiRequest(cfg, 'POST', `/api/services/${id}/archive`, { body: mp }));
}

async function cmdCredential(cfg, args) {
  const sub = args[0];
  const rest = args.slice(1);
  switch (sub) {
    case 'list':
      print(await apiRequest(cfg, 'GET', '/api/credentials'));
      return;
    case 'create': {
      const body = parseJsonStdin(await readStdin());
      print(await apiRequest(cfg, 'POST', '/api/credentials', { body: JSON.stringify(body) }));
      return;
    }
    case 'edit': {
      requireArgs(rest, 1, 'pagekit credential edit <id>  (stdin JSON)');
      const body = parseJsonStdin(await readStdin());
      print(await apiRequest(cfg, 'PUT', `/api/credentials/${rest[0]}`, { body: JSON.stringify(body) }));
      return;
    }
    case 'delete': {
      requireArgs(rest, 1, 'pagekit credential delete <id>');
      print(await apiRequest(cfg, 'DELETE', `/api/credentials/${rest[0]}`));
      return;
    }
    default:
      die(EXIT.USAGE, `未知 credential 子命令: ${sub}\n可用: list create edit delete`);
  }
}

async function cmdLog(cfg, args) {
  if (args[0] !== 'list') die(EXIT.USAGE, '用法: pagekit log list');
  const data = await apiRequest(cfg, 'GET', '/api/logs');
  print(data);
}

async function cmdConfig(cfg, args) {
  const sub = args[0];
  if (sub === 'get') {
    print(await apiRequest(cfg, 'GET', '/api/config'));
    return;
  }
  if (sub === 'set') {
    const body = parseJsonStdin(await readStdin());
    print(await apiRequest(cfg, 'PUT', '/api/config', { body: JSON.stringify(body) }));
    return;
  }
  die(EXIT.USAGE, '用法: pagekit config get | config set');
}

async function cmdRaw(cfg, args) {
  requireArgs(args, 2, 'pagekit raw <method> <path> [json]');
  const [method, apiPath] = args;
  let body = null;
  if (args[2]) body = args[2];
  else if (!process.stdin.isTTY) {
    const raw = await readStdin();
    if (raw.trim()) body = raw;
  }
  print(await apiRequest(cfg, method.toUpperCase(), apiPath, body ? { body } : {}));
}

const USAGE = `pagekit — 控制 Pagekit 静态站点发布系统

用法:
  pagekit login                                # 浏览器登录,缓存免过期 token
  pagekit logout                               # 清除本地缓存的 token

  pagekit service list [--full]
  pagekit service get <id>
  pagekit service create                       # stdin JSON
  pagekit service edit <id>                    # stdin JSON (配置改动)
  pagekit service delete <id>
  pagekit service publish <id>
  pagekit service unpublish <id>
  pagekit service update <id>                  # 更新文件版本
  pagekit service logs <id>
  pagekit service qrcode <id>                  # 输出图片二进制
  pagekit service qrcode-url <id>
  pagekit service branches --repo <url> --credential <id>
  pagekit service trigger-webhook <id>

  pagekit archive upload <id> <file>           # 上传 Zip 服务存档包

  pagekit credential list | create | edit <id> | delete <id>

  pagekit log list

  pagekit config get | config set              # set 走 stdin JSON

  pagekit raw <method> <path> [json]           # 任意 API 调用

认证: 不保存账号密码。首次操作自动打开浏览器到 Pagekit 登录页,登录成功后
       缓存免过期 JWT 于 ~/.cache/pagekit/token.json;401 自动重登一次。
       无头/CI 环境可用环境变量 PAGEKIT_TOKEN 直接注入已有 token。

退出码: 0 成功 / 1 认证 / 2 用法 / 3 网络 / 4+ = HTTP 状态码
配置: config.json (仅 host) 或环境变量 PAGEKIT_HOST (可选 PAGEKIT_TOKEN)`;

async function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv[0] === '-h' || argv[0] === '--help') {
    process.stdout.write(USAGE + '\n');
    process.exit(argv.length === 0 ? EXIT.USAGE : EXIT.OK);
  }
  const cfg = loadConfig();
  if (!cfg.host) {
    die(EXIT.USAGE, '配置不完整:需 host。见 config.json 或环境变量 PAGEKIT_HOST。');
  }
  const [group, ...rest] = argv;
  try {
    switch (group) {
      case 'login': {
        // 强制重新登录:清缓存后走浏览器流程
        if (!cfg.token) clearCachedToken();
        await login(cfg);
        print({ ok: true });
        return;
      }
      case 'logout': {
        clearCachedToken();
        print({ ok: true });
        return;
      }
      case 'service': await cmdService(cfg, rest); return;
      case 'archive': await cmdArchive(cfg, rest); return;
      case 'credential': await cmdCredential(cfg, rest); return;
      case 'log': await cmdLog(cfg, rest); return;
      case 'config': await cmdConfig(cfg, rest); return;
      case 'raw': await cmdRaw(cfg, rest); return;
      default:
        die(EXIT.USAGE, `未知命令: ${group}\n\n${USAGE}`);
    }
  } catch (e) {
    if (e && (e.code === 'ECONNREFUSED' || e.code === 'ENOTFOUND' || e.code === 'ECONNRESET' || e.code === 'ETIMEDOUT')) {
      die(EXIT.NETWORK, `网络错误 (${e.code}): 无法连接 ${cfg.host}\n${e.message}`);
    }
    die(EXIT.NETWORK, `请求失败: ${e.message}`);
  }
}

main();
