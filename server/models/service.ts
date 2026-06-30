import db from '../db';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { ServiceRow, SourceType } from '../types';
import { hasArchive } from '../lib/archive';

const MAX_AUTO_UPDATE_INTERVAL = 1440;

function normalizeAutoUpdateInterval(interval: unknown): number {
  const n = typeof interval === 'number' ? interval : parseInt(String(interval), 10);
  if (Number.isNaN(n) || n < 1) return 1;
  if (n > MAX_AUTO_UPDATE_INTERVAL) return MAX_AUTO_UPDATE_INTERVAL;
  return n;
}

async function attachArchiveFlag(service: ServiceRow): Promise<ServiceRow> {
  if (service.source_type === 'zip') {
    return { ...service, has_archive: await hasArchive(service.name) };
  }
  return service;
}

export const Service = {
  list(): ServiceRow[] {
    return db.prepare(`
      SELECT s.*, c.name as credential_name
      FROM services s
      LEFT JOIN credentials c ON s.credential_id = c.id
      ORDER BY s.created_at DESC
    `).all() as ServiceRow[];
  },

  async listWithArchive(): Promise<ServiceRow[]> {
    const rows = this.list();
    return Promise.all(rows.map((s) => attachArchiveFlag(s)));
  },

  /** 已发布且开启定时更新的 Git 服务 */
  listScheduledEligible(): ServiceRow[] {
    return db.prepare(`
      SELECT * FROM services
      WHERE source_type = 'git'
        AND status = 'published'
        AND auto_update_enabled = 1
    `).all() as ServiceRow[];
  },

  getById(id: string): ServiceRow | undefined {
    return db.prepare(`
      SELECT s.*, c.name as credential_name
      FROM services s
      LEFT JOIN credentials c ON s.credential_id = c.id
      WHERE s.id = ?
    `).get(id) as ServiceRow | undefined;
  },

  async getByIdWithArchive(id: string): Promise<ServiceRow | undefined> {
    const row = this.getById(id);
    if (!row) return undefined;
    return attachArchiveFlag(row);
  },

  getByName(name: string): ServiceRow | undefined {
    return db.prepare('SELECT * FROM services WHERE name = ?').get(name) as ServiceRow | undefined;
  },

  create(data: {
    name: string;
    source_type?: SourceType;
    git_url?: string;
    credential_id?: string;
    branch?: string;
    publish_dir?: string;
    auto_update_enabled?: boolean;
    auto_update_interval?: number;
  }): ServiceRow {
    const id = uuidv4();
    const sourceType = data.source_type || 'git';
    const autoEnabled = data.auto_update_enabled ? 1 : 0;
    const autoInterval = normalizeAutoUpdateInterval(data.auto_update_interval ?? 1);

    if (sourceType === 'git') {
      if (!data.git_url || !data.credential_id) {
        throw new Error('Git 地址和凭证不能为空');
      }
      const webhook_secret = crypto.randomBytes(32).toString('hex');
      db.prepare(`
        INSERT INTO services (
          id, name, source_type, git_url, credential_id, branch, publish_dir,
          webhook_secret, auto_update_enabled, auto_update_interval
        )
        VALUES (?, ?, 'git', ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        data.name,
        data.git_url,
        data.credential_id,
        data.branch || 'main',
        data.publish_dir || '',
        webhook_secret,
        autoEnabled,
        autoInterval
      );
    } else {
      db.prepare(`
        INSERT INTO services (id, name, source_type, publish_dir)
        VALUES (?, ?, 'zip', ?)
      `).run(id, data.name, data.publish_dir || '');
    }

    return this.getById(id)!;
  },

  update(id: string, data: {
    name?: string;
    git_url?: string;
    credential_id?: string;
    branch?: string;
    publish_dir?: string;
    auto_update_enabled?: boolean;
    auto_update_interval?: number;
  }): ServiceRow | null {
    const existing = db.prepare('SELECT * FROM services WHERE id = ?').get(id) as ServiceRow | undefined;
    if (!existing) return null;

    if (existing.source_type === 'zip') {
      db.prepare(`
        UPDATE services SET
          name = COALESCE(?, name),
          publish_dir = COALESCE(?, publish_dir),
          updated_at = datetime('now')
        WHERE id = ?
      `).run(data.name, data.publish_dir, id);
    } else {
      const autoEnabled = data.auto_update_enabled !== undefined
        ? (data.auto_update_enabled ? 1 : 0)
        : undefined;
      const autoInterval = data.auto_update_interval !== undefined
        ? normalizeAutoUpdateInterval(data.auto_update_interval)
        : undefined;

      db.prepare(`
        UPDATE services SET
          name = COALESCE(?, name),
          git_url = COALESCE(?, git_url),
          credential_id = COALESCE(?, credential_id),
          branch = COALESCE(?, branch),
          publish_dir = COALESCE(?, publish_dir),
          auto_update_enabled = COALESCE(?, auto_update_enabled),
          auto_update_interval = COALESCE(?, auto_update_interval),
          updated_at = datetime('now')
        WHERE id = ?
      `).run(
        data.name,
        data.git_url,
        data.credential_id,
        data.branch,
        data.publish_dir,
        autoEnabled,
        autoInterval,
        id
      );
    }

    return this.getById(id)!;
  },

  updateStatus(id: string, status: 'published' | 'unpublished'): void {
    if (status === 'published') {
      db.prepare(
        "UPDATE services SET status = ?, last_publish_at = datetime('now'), updated_at = datetime('now') WHERE id = ?"
      ).run(status, id);
    } else {
      db.prepare(
        "UPDATE services SET status = ?, updated_at = datetime('now') WHERE id = ?"
      ).run(status, id);
    }
  },

  updateLastUpdate(id: string): void {
    db.prepare(
      "UPDATE services SET last_update_at = datetime('now'), updated_at = datetime('now') WHERE id = ?"
    ).run(id);
  },

  setLastDeployedCommit(id: string, commit: string): void {
    db.prepare(
      "UPDATE services SET last_deployed_commit = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(commit, id);
  },

  updateLastScheduledAt(id: string): void {
    db.prepare(
      "UPDATE services SET last_scheduled_at = datetime('now') WHERE id = ?"
    ).run(id);
  },

  setWebhookId(id: string, webhookId: string | null): void {
    db.prepare(
      "UPDATE services SET webhook_id = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(webhookId, id);
  },

  delete(id: string) {
    return db.prepare('DELETE FROM services WHERE id = ?').run(id);
  },

  getByWebhookSecret(secret: string): ServiceRow | undefined {
    return db.prepare('SELECT * FROM services WHERE webhook_secret = ?').get(secret) as ServiceRow | undefined;
  },
};
