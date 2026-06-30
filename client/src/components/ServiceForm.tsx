import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import * as api from '../api/client';

export default function ServiceForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = !!id;

  const [name, setName] = useState('');
  const [gitUrl, setGitUrl] = useState('');
  const [credentialId, setCredentialId] = useState('');
  const [branch, setBranch] = useState('main');
  const [publishDir, setPublishDir] = useState('');
  const [credentials, setCredentials] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getCredentials().then(setCredentials);
    if (id) {
      api.getService(id).then((s) => {
        setName(s.name);
        setGitUrl(s.git_url);
        setCredentialId(s.credential_id);
        setBranch(s.branch);
        setPublishDir(s.publish_dir);
      });
    }
  }, [id]);

  // Auto-extract repo name from git URL
  const handleGitUrlChange = (url: string) => {
    setGitUrl(url);
    if (!name || !isEdit) {
      try {
        const match = url.match(/\/([^/]+?)(?:\.git)?$/);
        if (match) setName(match[1].toLowerCase().replace(/[^a-z0-9_-]/g, '-'));
      } catch {}
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isEdit) {
        await api.updateService(id!, { name, git_url: gitUrl, credential_id: credentialId, branch, publish_dir: publishDir });
      } else {
        await api.createService({ name, git_url: gitUrl, credential_id: credentialId, branch, publish_dir: publishDir });
      }
      navigate('/');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1>{isEdit ? '编辑服务' : '添加服务'}</h1>
      </div>

      <form onSubmit={handleSubmit} className="form-card">
        {error && <div className="alert alert-error">{error}</div>}

        <div className="form-group">
          <label>Git 仓库地址 *</label>
          <input
            type="text"
            value={gitUrl}
            onChange={(e) => handleGitUrlChange(e.target.value)}
            placeholder="https://gogs.example.com/owner/repo.git"
            required
          />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>服务名称 *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-app"
              pattern="[a-zA-Z0-9_-]+"
              title="只能包含字母、数字、下划线和连字符"
              required
            />
            <small>用于访问地址: {`{host}`}/{name || '...'}</small>
          </div>

          <div className="form-group">
            <label>分支</label>
            <input
              type="text"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              placeholder="main"
            />
          </div>
        </div>

        <div className="form-group">
          <label>凭证 *</label>
          <select value={credentialId} onChange={(e) => setCredentialId(e.target.value)} required>
            <option value="">请选择凭证</option>
            {credentials.map((c) => (
              <option key={c.id} value={c.id}>{c.name} ({c.username})</option>
            ))}
          </select>
          <small>还没有凭证？<a href="#" onClick={(e) => { e.preventDefault(); navigate('/credentials'); }}>去创建</a></small>
        </div>

        <div className="form-group">
          <label>发布目录</label>
          <input
            type="text"
            value={publishDir}
            onChange={(e) => setPublishDir(e.target.value)}
            placeholder="留空则发布仓库根目录，如 dist、build"
          />
          <small>相对于仓库根目录的子目录路径</small>
        </div>

        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? '保存中...' : (isEdit ? '保存' : '创建')}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => navigate('/')}>取消</button>
        </div>
      </form>
    </div>
  );
}
