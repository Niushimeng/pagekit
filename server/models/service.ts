import db from '../db';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { ServiceRow, SourceType } from '../types';
import { hasArchive } from '../lib/archive';

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
  }): ServiceRow {
    const id = uuidv4();
    const sourceType = data.source_type || 'git';

    if (sourceType === 'git') {
      if (!data.git_url || !data.credential_id) {
        throw new Error('Git 地址和凭证不能为空');
      }
      const webhook_secret = crypto.randomBytes(32).toString('hex');
      db.prepare(`
        INSERT INTO services (id, name, source_type, git_url, credential_id, branch, publish_dir, webhook_secret)
        VALUES (?, ?, 'git', ?, ?, ?, ?, ?)
      `).run(
        id,
        data.name,
        data.git_url,
        data.credential_id,
        data.branch || 'main',
        data.publish_dir || '',
        webhook_secret
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
      db.prepare(`
        UPDATE services SET
          name = COALESCE(?, name),
          git_url = COALESCE(?, git_url),
          credential_id = COALESCE(?, credential_id),
          branch = COALESCE(?, branch),
          publish_dir = COALESCE(?, publish_dir),
          updated_at = datetime('now')
        WHERE id = ?
      `).run(data.name, data.git_url, data.credential_id, data.branch, data.publish_dir, id);
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
