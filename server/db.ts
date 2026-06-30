import Database, { Database as DatabaseType } from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import config from './config';

fs.mkdirSync(config.dataDir, { recursive: true });

const dbPath = path.join(config.dataDir, 'pagekit.db');
const db: DatabaseType = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS credentials (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    username TEXT NOT NULL,
    password_encrypted TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS services (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    source_type TEXT NOT NULL DEFAULT 'git',
    git_url TEXT,
    credential_id TEXT,
    branch TEXT DEFAULT 'main',
    publish_dir TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'unpublished',
    webhook_secret TEXT,
    webhook_id TEXT,
    last_publish_at TEXT,
    last_update_at TEXT,
    auto_update_enabled INTEGER NOT NULL DEFAULT 0,
    auto_update_interval INTEGER NOT NULL DEFAULT 1,
    last_deployed_commit TEXT,
    last_scheduled_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (credential_id) REFERENCES credentials(id)
  );

  CREATE TABLE IF NOT EXISTS operation_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    service_id TEXT NOT NULL,
    action TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'success',
    message TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE
  );
`);

// 旧库迁移：增加 source_type，Git 字段改为可空
const serviceColumns = db.prepare('PRAGMA table_info(services)').all() as { name: string }[];
const hasSourceType = serviceColumns.some((c) => c.name === 'source_type');

if (!hasSourceType && serviceColumns.length > 0) {
  db.exec(`
    CREATE TABLE services_new (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      source_type TEXT NOT NULL DEFAULT 'git',
      git_url TEXT,
      credential_id TEXT,
      branch TEXT DEFAULT 'main',
      publish_dir TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'unpublished',
      webhook_secret TEXT,
      webhook_id TEXT,
      last_publish_at TEXT,
      last_update_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (credential_id) REFERENCES credentials(id)
    );
    INSERT INTO services_new (
      id, name, source_type, git_url, credential_id, branch, publish_dir,
      status, webhook_secret, webhook_id, last_publish_at, last_update_at,
      created_at, updated_at
    )
    SELECT
      id, name, 'git', git_url, credential_id, branch, publish_dir,
      status, webhook_secret, webhook_id, last_publish_at, last_update_at,
      created_at, updated_at
    FROM services;
    DROP TABLE services;
    ALTER TABLE services_new RENAME TO services;
  `);
}

// 旧库迁移：增加定时更新字段
const serviceColumnsAfter = db.prepare('PRAGMA table_info(services)').all() as { name: string }[];
if (!serviceColumnsAfter.some((c) => c.name === 'auto_update_enabled')) {
  db.exec(`
    ALTER TABLE services ADD COLUMN auto_update_enabled INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE services ADD COLUMN auto_update_interval INTEGER NOT NULL DEFAULT 1;
    ALTER TABLE services ADD COLUMN last_deployed_commit TEXT;
    ALTER TABLE services ADD COLUMN last_scheduled_at TEXT;
  `);
}

export default db;
