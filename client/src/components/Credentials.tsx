import React, { useEffect, useState } from 'react';
import * as api from '../api/client';

interface Credential {
  id: string;
  name: string;
  username: string;
  created_at: string;
}

export default function Credentials() {
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const data = await api.getCredentials();
      setCredentials(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const resetForm = () => {
    setShowForm(false);
    setEditId(null);
    setName('');
    setUsername('');
    setPassword('');
    setError('');
  };

  const handleEdit = (cred: Credential) => {
    setEditId(cred.id);
    setName(cred.name);
    setUsername(cred.username);
    setPassword('');
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);

    try {
      if (editId) {
        const data: any = { name, username };
        if (password) data.password = password;
        await api.updateCredential(editId, data);
      } else {
        await api.createCredential({ name, username, password });
      }
      resetForm();
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`确定要删除凭证「${name}」？`)) return;
    try {
      await api.deleteCredential(id);
      await load();
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (loading) return <div className="page-loading">加载中...</div>;

  return (
    <div className="page">
      <div className="page-header">
        <h1>凭证管理</h1>
        <button className="btn btn-primary" onClick={() => { resetForm(); setShowForm(true); }}>
          + 添加凭证
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {showForm && (
        <form onSubmit={handleSubmit} className="form-card">
          <h3>{editId ? '编辑凭证' : '添加凭证'}</h3>
          <div className="form-row">
            <div className="form-group">
              <label>凭证名称 *</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} required placeholder="如: 公司 Gogs" />
            </div>
            <div className="form-group">
              <label>Git 用户名 *</label>
              <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} required placeholder="git-user" />
            </div>
          </div>
          <div className="form-group">
            <label>Git 密码 {editId ? '(留空则不修改)' : '*'}</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required={!editId} placeholder="••••••" />
          </div>
          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? '保存中...' : '保存'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={resetForm}>取消</button>
          </div>
        </form>
      )}

      {credentials.length === 0 && !showForm ? (
        <div className="empty-state">
          <p>还没有任何凭证</p>
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>添加第一个凭证</button>
        </div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>名称</th>
                <th>用户名</th>
                <th>创建时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {credentials.map((c) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td className="mono">{c.username}</td>
                  <td>{new Date(c.created_at).toLocaleString('zh-CN')}</td>
                  <td>
                    <button className="btn btn-ghost btn-sm" onClick={() => handleEdit(c)}>编辑</button>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDelete(c.id, c.name)}>删除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
