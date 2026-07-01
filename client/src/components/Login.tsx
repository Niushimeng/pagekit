import React, { useState, useEffect } from 'react';
import { useAuth } from '../api/auth';
import * as api from '../api/client';

interface CliFlow {
  redirectUri: string;
  state: string;
}

// 从 URL 读取 CLI 登录流程参数(skill 启动浏览器到 /login?redirect_uri=...&state=...)
function readCliFlow(): CliFlow | null {
  const params = new URLSearchParams(window.location.search);
  const redirectUri = params.get('redirect_uri');
  const state = params.get('state');
  return redirectUri && state ? { redirectUri, state } : null;
}

// 仅允许 loopback 回调地址,防止 token 被重定向到外部主机
function isLoopback(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:') return false;
    const h = u.hostname;
    return h === '127.0.0.1' || h === 'localhost' || h === '[::1]' || h === '::1';
  } catch {
    return false;
  }
}

// 铸造免过期 CLI token 并重定向回 skill 的本地回调地址
async function mintAndRedirect(flow: CliFlow): Promise<void> {
  if (!isLoopback(flow.redirectUri)) {
    throw new Error('非法 redirect_uri:仅允许 http://127.0.0.1 / localhost / [::1]');
  }
  const data = await api.getCliToken();
  const cb = new URL(flow.redirectUri);
  cb.searchParams.set('token', data.token);
  cb.searchParams.set('state', flow.state);
  window.location.href = cb.toString();
}

export default function Login() {
  const { login, isAuthenticated } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const cliFlow = readCliFlow();

  // CLI 流程 + 已登录:跳过表单,直接铸造 CLI token 并重定向
  useEffect(() => {
    if (!cliFlow || !isAuthenticated) return;
    let cancelled = false;
    setLoading(true);
    mintAndRedirect(cliFlow)
      .catch((err) => {
        if (cancelled) return;
        // web token 可能已过期 → 清掉,回退到表单
        localStorage.removeItem('token');
        setLoading(false);
        setError(err.message || 'CLI 登录失败,请重新输入密码');
      });
    return () => {
      cancelled = true;
    };
  }, [cliFlow, isAuthenticated]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username, password);
      if (cliFlow) {
        // CLI 流程:登录成功后铸造 CLI token 并重定向回 skill
        await mintAndRedirect(cliFlow);
        return;
      }
    } catch (err: any) {
      setError(err.message || '登录失败');
    } finally {
      setLoading(false);
    }
  };

  if (cliFlow && isAuthenticated) {
    return (
      <div className="login-page">
        <div className="login-card">
          <h1>Pagekit</h1>
          <p className="login-subtitle">正在连接 CLI…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>Pagekit</h1>
        <p className="login-subtitle">服务发布系统</p>
        <form onSubmit={handleSubmit}>
          {error && <div className="alert alert-error">{error}</div>}
          <div className="form-group">
            <label>用户名</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
              required
            />
          </div>
          <div className="form-group">
            <label>密码</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
            {loading ? '登录中...' : '登录'}
          </button>
        </form>
      </div>
    </div>
  );
}
