import db from '../db';
import { LogRow } from '../types';

export const Log = {
  create(data: { service_id: string; action: string; status?: 'success' | 'error'; message?: string }) {
    return db.prepare(
      'INSERT INTO operation_logs (service_id, action, status, message) VALUES (?, ?, ?, ?)'
    ).run(data.service_id, data.action, data.status || 'success', data.message || null);
  },

  listByService(serviceId: string, limit = 50): LogRow[] {
    return db.prepare(
      'SELECT * FROM operation_logs WHERE service_id = ? ORDER BY created_at DESC LIMIT ?'
    ).all(serviceId, limit) as LogRow[];
  },

  listAll(limit = 100): LogRow[] {
    return db.prepare(`
      SELECT ol.*, s.name as service_name
      FROM operation_logs ol
      LEFT JOIN services s ON ol.service_id = s.id
      ORDER BY ol.created_at DESC
      LIMIT ?
    `).all(limit) as LogRow[];
  },
};
