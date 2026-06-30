import db from '../db';
import { encrypt, decrypt } from '../lib/crypto';
import { v4 as uuidv4 } from 'uuid';
import { CredentialRow } from '../types';

export const Credential = {
  list(): Omit<CredentialRow, 'password_encrypted'>[] {
    return db.prepare(
      'SELECT id, name, username, created_at, updated_at FROM credentials ORDER BY created_at DESC'
    ).all() as Omit<CredentialRow, 'password_encrypted'>[];
  },

  getById(id: string): Omit<CredentialRow, 'password_encrypted'> | undefined {
    return db.prepare(
      'SELECT id, name, username, created_at, updated_at FROM credentials WHERE id = ?'
    ).get(id) as Omit<CredentialRow, 'password_encrypted'> | undefined;
  },

  getByIdWithPassword(id: string): (Omit<CredentialRow, 'password_encrypted'> & { password: string }) | undefined {
    const row = db.prepare('SELECT * FROM credentials WHERE id = ?').get(id) as CredentialRow | undefined;
    if (!row) return undefined;
    return {
      id: row.id,
      name: row.name,
      username: row.username,
      password: decrypt(row.password_encrypted),
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  },

  create(data: { name: string; username: string; password: string }) {
    const id = uuidv4();
    const encrypted = encrypt(data.password);
    db.prepare(
      'INSERT INTO credentials (id, name, username, password_encrypted) VALUES (?, ?, ?, ?)'
    ).run(id, data.name, data.username, encrypted);
    return this.getById(id)!;
  },

  update(id: string, data: { name?: string; username?: string; password?: string }) {
    const existing = db.prepare('SELECT * FROM credentials WHERE id = ?').get(id) as CredentialRow | undefined;
    if (!existing) return null;

    const newName = data.name ?? existing.name;
    const newUsername = data.username ?? existing.username;

    if (data.password) {
      const encrypted = encrypt(data.password);
      db.prepare(
        "UPDATE credentials SET name = ?, username = ?, password_encrypted = ?, updated_at = datetime('now') WHERE id = ?"
      ).run(newName, newUsername, encrypted, id);
    } else {
      db.prepare(
        "UPDATE credentials SET name = ?, username = ?, updated_at = datetime('now') WHERE id = ?"
      ).run(newName, newUsername, id);
    }
    return this.getById(id);
  },

  delete(id: string) {
    const usage = db.prepare('SELECT COUNT(*) as count FROM services WHERE credential_id = ?').get(id) as { count: number };
    if (usage.count > 0) {
      throw new Error('该凭证正在被服务使用，无法删除');
    }
    return db.prepare('DELETE FROM credentials WHERE id = ?').run(id);
  },
};
