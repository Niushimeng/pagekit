import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import * as api from '../api/client';

interface Service {
  id: string;
  name: string;
  source_type: api.SourceType;
  git_url: string | null;
  branch: string | null;
  status: string;
  credential_name?: string;
  has_archive?: boolean;
  last_publish_at: string | null;
  last_update_at: string | null;
}

export default function ServiceList() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [qrModal, setQrModal] = useState<{ id: string; name: string } | null>(null);
  const [updateModal, setUpdateModal] = useState<Service | null>(null);
  const [updateFile, setUpdateFile] = useState<File | null>(null);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const data = await api.getServices();
      setServices(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleAction = async (id: string, action: string) => {
    setActionLoading(`${id}-${action}`);
    setError('');
    try {
      if (action === 'publish') await api.publishService(id);
      else if (action === 'unpublish') await api.unpublishService(id);
      else if (action === 'update') await api.updateServiceCode(id);
      else if (action === 'delete') {
        if (!confirm('确定要删除此服务？此操作不可恢复。')) return;
        await api.deleteService(id);
      }
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleZipUpdate = async () => {
    if (!updateModal) return;
    setActionLoading(`${updateModal.id}-update`);
    setError('');
    try {
      await api.updateServiceCode(updateModal.id, updateFile || undefined);
      setUpdateModal(null);
      setUpdateFile(null);
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const openUpdateModal = (service: Service) => {
    setUpdateModal(service);
    setUpdateFile(null);
    setError('');
  };

  if (loading) return <div className="page-loading">加载中...</div>;

  return (
    <div className="page">
      <div className="page-header">
        <h1>服务列表</h1>
        <Link to="/services/new" className="btn btn-primary">+ 添加服务</Link>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {services.length === 0 ? (
        <div className="empty-state">
          <p>还没有任何服务</p>
          <Link to="/services/new" className="btn btn-primary">添加第一个服务</Link>
        </div>
      ) : (
        <div className="service-grid">
          {services.map((s) => (
            <div key={s.id} className={`service-card ${s.status === 'published' ? 'published' : ''}`}>
              <div className="service-card-header">
                <h3>{s.name}</h3>
                <div className="service-badges">
                  <span className={`badge badge-source-${s.source_type}`}>
                    {s.source_type === 'zip' ? 'Zip' : 'Git'}
                  </span>
                  <span className={`badge badge-${s.status}`}>
                    {s.status === 'published' ? '已发布' : '未发布'}
                  </span>
                </div>
              </div>
              <div className="service-card-body">
                {s.source_type === 'git' ? (
                  <>
                    <div className="service-info">
                      <span className="label">仓库:</span> <span className="value mono">{s.git_url}</span>
                    </div>
                    <div className="service-info">
                      <span className="label">分支:</span> <span className="value mono">{s.branch}</span>
                    </div>
                    <div className="service-info">
                      <span className="label">凭证:</span> <span className="value">{s.credential_name || '-'}</span>
                    </div>
                  </>
                ) : (
                  <div className="service-info">
                    <span className="label">存档包:</span>
                    <span className="value">{s.has_archive ? '已上传' : '未上传'}</span>
                  </div>
                )}
                {s.last_publish_at && (
                  <div className="service-info">
                    <span className="label">发布时间:</span> <span className="value">{new Date(s.last_publish_at).toLocaleString('zh-CN')}</span>
                  </div>
                )}
                {s.last_update_at && (
                  <div className="service-info">
                    <span className="label">最近更新:</span> <span className="value">{new Date(s.last_update_at).toLocaleString('zh-CN')}</span>
                  </div>
                )}
              </div>
              <div className="service-card-actions">
                {s.status === 'unpublished' ? (
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={actionLoading === `${s.id}-publish` || (s.source_type === 'zip' && !s.has_archive)}
                    title={s.source_type === 'zip' && !s.has_archive ? '请先上传 zip 存档包' : undefined}
                    onClick={() => handleAction(s.id, 'publish')}
                  >
                    {actionLoading === `${s.id}-publish` ? '发布中...' : '发布'}
                  </button>
                ) : (
                  <>
                    <button
                      className="btn btn-success btn-sm"
                      disabled={actionLoading === `${s.id}-update`}
                      onClick={() => s.source_type === 'zip' ? openUpdateModal(s) : handleAction(s.id, 'update')}
                    >
                      {actionLoading === `${s.id}-update` ? '更新中...' : '更新'}
                    </button>
                    <button
                      className="btn btn-warning btn-sm"
                      disabled={actionLoading === `${s.id}-unpublish`}
                      onClick={() => handleAction(s.id, 'unpublish')}
                    >
                      {actionLoading === `${s.id}-unpublish` ? '取消中...' : '取消发布'}
                    </button>
                  </>
                )}
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setQrModal({ id: s.id, name: s.name })}
                >
                  二维码
                </button>
                <Link to={`/services/${s.id}`} className="btn btn-ghost btn-sm">编辑</Link>
                <button
                  className="btn btn-danger btn-sm"
                  disabled={actionLoading === `${s.id}-delete`}
                  onClick={() => handleAction(s.id, 'delete')}
                >
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {qrModal && (
        <div className="modal-overlay" onClick={() => setQrModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>二维码 - {qrModal.name}</h3>
            <div className="qr-code-container">
              <img src={api.getServiceQrCodeUrl(qrModal.id)} alt="QR Code" />
            </div>
            <button className="btn btn-primary" onClick={() => setQrModal(null)}>关闭</button>
          </div>
        </div>
      )}

      {updateModal && (
        <div className="modal-overlay" onClick={() => { setUpdateModal(null); setUpdateFile(null); }}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>更新 - {updateModal.name}</h3>
            <p className="modal-desc">可选择新的 zip 文件替换存档包；留空则从现有存档包重新解压发布。</p>
            <div className="form-group">
              <label>新 Zip 文件（可选）</label>
              <input
                type="file"
                accept=".zip"
                onChange={(e) => setUpdateFile(e.target.files?.[0] || null)}
              />
            </div>
            <div className="modal-actions">
              <button
                className="btn btn-success"
                disabled={actionLoading === `${updateModal.id}-update`}
                onClick={handleZipUpdate}
              >
                {actionLoading === `${updateModal.id}-update` ? '更新中...' : '确认更新'}
              </button>
              <button className="btn btn-ghost" onClick={() => { setUpdateModal(null); setUpdateFile(null); }}>取消</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
