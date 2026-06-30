import db from '../db';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { ServiceRow } from '../types';

export const Service = {
  list(): ServiceRow[] {
    return db.prepare(`
      SELECT s.*, c.name as credential_name
      FROM services s
      LEFT JOIN credentials c ON s.credential_id = c.id
      ORDER BY s.created_at DESC
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

  getByName(name: string): ServiceRow | undefined {
    return db.prepare('SELECT * FROM services WHERE name = ?').get(name) as ServiceRow | undefined;
  },

  create(data: { name: string; git_url: string; credential_id: string; branch?: string; publish_dir?: string }): ServiceRow {
    const id = uuidv4();
    const webhook_secret = crypto.randomBytes(32).toString('hex');
    db.prepare(`
      INSERT INTO services (id, name, git_url, credential_id, branch, publish_dir, webhook_secret)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, data.name, data.git_url, data.credential_id, data.branch || 'main', data.publish_dir || '', webhook_secret);
    return this.getById(id)!;
  },

  update(id: string, data: { name?: string; git_url?: string; credential_id?: string; branch?: string; publish_dir?: string }): ServiceRow | null {
    const existing = db.prepare('SELECT * FROM services WHERE id = ?').get(id) as ServiceRow | undefined;
    if (!existing) return null;

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
