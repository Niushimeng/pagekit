/**
 * 容器/首次部署启动脚本：检测 data 目录，必要时初始化数据库并输出管理员账号信息
 */
import fs from 'fs';
import path from 'path';
import config from './config';

/** 数据库文件路径 */
const dbPath = path.join(config.dataDir, 'pagekit.db');

/** 首次初始化标记文件，便于排查是否已完成 bootstrap */
const initMarkerPath = path.join(config.dataDir, '.initialized');

/** 确保数据目录、发布目录及 Git 缓存等子目录存在 */
function ensureDirectories(): void {
  const dirs = [
    config.dataDir,
    config.publishDir,
    config.tmpDir,
    config.oldDir,
    path.join(config.dataDir, 'repos'),
    path.join(config.dataDir, 'archives'),
  ];

  for (const dir of dirs) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/** 判断是否需要执行首次初始化（数据库文件不存在视为未初始化） */
function needsInitialization(): boolean {
  return !fs.existsSync(dbPath);
}

/** 执行数据库 schema 初始化（导入 db 模块即会建表） */
function initializeDatabase(): void {
  require('./db');
}

/** 记录初始管理员账号信息（账号来自 config.json） */
function seedAdminInfo(): void {
  const info = {
    username: config.admin.username,
    initializedAt: new Date().toISOString(),
    note: '管理员密码见 config.json 中 admin.password，部署后请尽快修改',
  };

  fs.writeFileSync(initMarkerPath, JSON.stringify(info, null, 2), 'utf-8');

  console.log('[pagekit] 数据库初始化完成');
  console.log(`[pagekit] 管理员账号: ${config.admin.username}`);
  console.log('[pagekit] 管理员密码: 见 config.json 中 admin.password（首次部署请尽快修改）');
}

function main(): void {
  ensureDirectories();

  if (!needsInitialization()) {
    console.log('[pagekit] 数据目录已存在，跳过初始化');
    return;
  }

  console.log('[pagekit] 检测到 data 目录未初始化，正在创建数据库...');
  initializeDatabase();
  seedAdminInfo();
}

main();
