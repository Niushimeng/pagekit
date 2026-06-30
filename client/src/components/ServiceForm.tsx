import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import * as api from '../api/client';

export default function ServiceForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = !!id;

  const [sourceType, setSourceType] = useState<api.SourceType>('git');
  const [name, setName] = useState('');
  const [gitUrl, setGitUrl] = useState('');
  const [credentialId, setCredentialId] = useState('');
  const [branch, setBranch] = useState('');
  const [publishDir, setPublishDir] = useState('');
  const [archiveFile, setArchiveFile] = useState<File | null>(null);
  const [hasArchive, setHasArchive] = useState(false);
  const [credentials, setCredentials] = useState<any[]>([]);
  const [branches, setBranches] = useState<string[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [branchesError, setBranchesError] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [initialBranch, setInitialBranch] = useState('');
  const [autoUpdateEnabled, setAutoUpdateEnabled] = useState(false);
  const [autoUpdateInterval, setAutoUpdateInterval] = useState(1);

  useEffect(() => {
    api.getCredentials().then(setCredentials);
    if (id) {
      api.getService(id).then((s) => {
        setSourceType(s.source_type || 'git');
        setName(s.name);
        setGitUrl(s.git_url || '');
        setCredentialId(s.credential_id || '');
        setBranch(s.branch || '');
        setInitialBranch(s.branch || '');
        setPublishDir(s.publish_dir || '');
        setHasArchive(!!s.has_archive);
        setAutoUpdateEnabled(!!s.auto_update_enabled);
        setAutoUpdateInterval(s.auto_update_interval || 1);
      });
    }
  }, [id]);

  // Git 服务：填写仓库地址并选择凭证后，自动拉取远程分支
  useEffect(() => {
    if (sourceType !== 'git' || !gitUrl.trim() || !credentialId) {
      setBranches([]);
      setBranchesError('');
      if (!isEdit && sourceType === 'git') setBranch('');
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setBranchesLoading(true);
      setBranchesError('');
      try {
        const data = await api.getRemoteBranches(gitUrl.trim(), credentialId);
        if (cancelled) return;

        setBranches(data.branches);
        if (data.branches.length === 0) {
          setBranch('');
          setBranchesError('远程仓库没有可用分支');
          return;
        }

        const keepCurrent = branch && data.branches.includes(branch);
        const keepInitial = initialBranch && data.branches.includes(initialBranch);
        if (keepCurrent) {
          setBranch(branch);
        } else if (keepInitial) {
          setBranch(initialBranch);
        } else if (data.defaultBranch) {
          setBranch(data.defaultBranch);
        } else {
          setBranch(data.branches[0]);
        }
      } catch (err: any) {
        if (cancelled) return;
        setBranches([]);
        setBranch('');
        setBranchesError(err.message || '获取分支失败');
      } finally {
        if (!cancelled) setBranchesLoading(false);
      }
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [gitUrl, credentialId, sourceType]);

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

    if (sourceType === 'git' && !branch) {
      setError('请选择分支');
      return;
    }

    setLoading(true);

    try {
      if (isEdit) {
        if (sourceType === 'git') {
          await api.updateService(id!, {
            name, git_url: gitUrl, credential_id: credentialId, branch, publish_dir: publishDir,
            auto_update_enabled: autoUpdateEnabled,
            auto_update_interval: autoUpdateInterval,
          });
        } else {
          await api.updateService(id!, { name, publish_dir: publishDir });
          if (archiveFile) {
            await api.uploadArchive(id!, archiveFile);
          }
        }
      } else {
        const payload: any = { name, source_type: sourceType, publish_dir: publishDir };
        if (sourceType === 'git') {
          Object.assign(payload, {
            git_url: gitUrl,
            credential_id: credentialId,
            branch,
            auto_update_enabled: autoUpdateEnabled,
            auto_update_interval: autoUpdateInterval,
          });
        }
        const service = await api.createService(payload);
        if (sourceType === 'zip' && archiveFile) {
          await api.uploadArchive(service.id, archiveFile);
        }
      }
      navigate('/');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const canSelectBranch = sourceType === 'git' && !!gitUrl.trim() && !!credentialId;
  const gitSubmitDisabled = sourceType === 'git' && (branchesLoading || !branch);

  return (
    <div className="page">
      <div className="page-header">
        <h1>{isEdit ? '编辑服务' : '添加服务'}</h1>
      </div>

      <form onSubmit={handleSubmit} className="form-card">
        {error && <div className="alert alert-error">{error}</div>}

        {/* 创建时可选来源类型；编辑时只读展示 */}
        {!isEdit ? (
          <div className="source-type-tabs">
            <button
              type="button"
              className={`source-type-tab ${sourceType === 'git' ? 'active' : ''}`}
              onClick={() => setSourceType('git')}
            >
              Git 仓库
            </button>
            <button
              type="button"
              className={`source-type-tab ${sourceType === 'zip' ? 'active' : ''}`}
              onClick={() => setSourceType('zip')}
            >
              Zip 包
            </button>
          </div>
        ) : (
          <div className="form-group">
            <label>来源类型</label>
            <div className="readonly-field">{sourceType === 'git' ? 'Git 仓库' : 'Zip 包'}</div>
          </div>
        )}

        {sourceType === 'git' && (
          <>
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
          </>
        )}

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

          {sourceType === 'git' && (
            <div className="form-group">
              <label>分支 *</label>
              <select
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                required
                disabled={!canSelectBranch || branchesLoading || branches.length === 0}
              >
                {!canSelectBranch && <option value="">请先填写仓库地址并选择凭证</option>}
                {canSelectBranch && branchesLoading && <option value="">加载分支中...</option>}
                {canSelectBranch && !branchesLoading && branches.length === 0 && (
                  <option value="">无可用分支</option>
                )}
                {branches.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
              {branchesError && <small className="text-error">{branchesError}</small>}
              {canSelectBranch && !branchesLoading && branches.length > 0 && (
                <small>已从远程仓库拉取 {branches.length} 个分支</small>
              )}
            </div>
          )}
        </div>

        <div className="form-group">
          <label>发布目录</label>
          <input
            type="text"
            value={publishDir}
            onChange={(e) => setPublishDir(e.target.value)}
            placeholder={sourceType === 'git' ? '留空则发布仓库根目录，如 dist、build' : '留空则发布 zip 根目录，如 dist、build'}
          />
          <small>{sourceType === 'git' ? '相对于仓库根目录的子目录路径' : '相对于 zip 解压根目录的子目录路径'}</small>
        </div>

        {sourceType === 'git' && (
          <div className="form-group auto-update-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={autoUpdateEnabled}
                onChange={(e) => setAutoUpdateEnabled(e.target.checked)}
              />
              自动更新
            </label>
            <div className="auto-update-interval">
              <label>拉取频率</label>
              <input
                type="number"
                min={1}
                max={1440}
                value={autoUpdateInterval}
                onChange={(e) => setAutoUpdateInterval(Math.max(1, parseInt(e.target.value, 10) || 1))}
                disabled={!autoUpdateEnabled}
              />
              <span>分钟</span>
            </div>
            <small>已发布时按频率自动 pull；与 Webhook 并存，无新提交则跳过切换</small>
          </div>
        )}

        {sourceType === 'zip' && (
          <div className="form-group">
            <label>Zip 存档包{isEdit ? '' : '（可选）'}</label>
            <input
              type="file"
              accept=".zip"
              onChange={(e) => setArchiveFile(e.target.files?.[0] || null)}
            />
            {isEdit && hasArchive && !archiveFile && (
              <small>当前已有存档包；选择新文件可替换</small>
            )}
            {!isEdit && (
              <small>可创建后再上传；发布前需有存档包</small>
            )}
          </div>
        )}

        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={loading || gitSubmitDisabled}>
            {loading ? '保存中...' : (isEdit ? '保存' : '创建')}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => navigate('/')}>取消</button>
        </div>
      </form>
    </div>
  );
}
