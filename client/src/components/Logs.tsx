import React, { useEffect, useState } from 'react';
import * as api from '../api/client';

interface LogEntry {
  id: number;
  service_id: string;
  service_name: string;
  action: string;
  status: string;
  message: string | null;
  created_at: string;
}

const ACTION_LABELS: Record<string, string> = {
  publish: '发布',
  unpublish: '取消发布',
  update: '更新',
  webhook: 'Webhook 触发',
  delete: '删除',
};

export default function Logs() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getAllLogs().then(setLogs).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="page-loading">加载中...</div>;

  return (
    <div className="page">
      <div className="page-header">
        <h1>操作日志</h1>
      </div>

      {logs.length === 0 ? (
        <div className="empty-state">
          <p>暂无操作记录</p>
        </div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>时间</th>
                <th>服务</th>
                <th>操作</th>
                <th>状态</th>
                <th>信息</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <td>{new Date(log.created_at).toLocaleString('zh-CN')}</td>
                  <td>{log.service_name || log.service_id}</td>
                  <td>{ACTION_LABELS[log.action] || log.action}</td>
                  <td>
                    <span className={`badge badge-${log.status === 'success' ? 'published' : 'error'}`}>
                      {log.status === 'success' ? '成功' : '失败'}
                    </span>
                  </td>
                  <td>{log.message || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
