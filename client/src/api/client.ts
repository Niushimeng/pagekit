const BASE = '/api';

function getToken(): string | null {
  return localStorage.getItem('token');
}

function headers(extra: Record<string, string> = {}, json = true): Record<string, string> {
  const h: Record<string, string> = { ...extra };
  if (json) h['Content-Type'] = 'application/json';
  const token = getToken();
  if (token) h['Authorization'] = `Bearer ${token}`;
  return h;
}

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    ...options,
    headers: headers(),
  });

  if (res.status === 401) {
    localStorage.removeItem('token');
    window.location.href = '/login';
    throw new Error('未登录');
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `请求失败 (${res.status})`);
  }

  return res.json();
}

async function uploadRequest<T>(url: string, formData: FormData): Promise<T> {
  const token = getToken();
  const h: Record<string, string> = {};
  if (token) h['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${url}`, {
    method: 'POST',
    headers: h,
    body: formData,
  });

  if (res.status === 401) {
    localStorage.removeItem('token');
    window.location.href = '/login';
    throw new Error('未登录');
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `请求失败 (${res.status})`);
  }

  return res.json();
}

export type SourceType = 'git' | 'zip';

// Auth
export const login = (username: string, password: string) =>
  request<{ token: string; username: string }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });

// 用当前 web 会话换取一个免过期的 CLI token(pagekit skill 浏览器登录流程)
export const getCliToken = () =>
  request<{ token: string; username: string }>('/auth/cli-token', { method: 'POST' });

// Credentials
export const getCredentials = () => request<any[]>('/credentials');
export const createCredential = (data: { name: string; username: string; password: string }) =>
  request<any>('/credentials', { method: 'POST', body: JSON.stringify(data) });
export const updateCredential = (id: string, data: { name?: string; username?: string; password?: string }) =>
  request<any>(`/credentials/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteCredential = (id: string) =>
  request<any>(`/credentials/${id}`, { method: 'DELETE' });

// Services
export const getRemoteBranches = (gitUrl: string, credentialId: string) =>
  request<{ branches: string[]; defaultBranch: string | null }>(
    `/services/branches?git_url=${encodeURIComponent(gitUrl)}&credential_id=${encodeURIComponent(credentialId)}`
  );
export const getServices = () => request<any[]>('/services');
export const getService = (id: string) => request<any>(`/services/${id}`);
export const createService = (data: any) =>
  request<any>('/services', { method: 'POST', body: JSON.stringify(data) });
export const updateService = (id: string, data: any) =>
  request<any>(`/services/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteService = (id: string) =>
  request<any>(`/services/${id}`, { method: 'DELETE' });
export const uploadArchive = (id: string, file: File) => {
  const form = new FormData();
  form.append('archive', file);
  return uploadRequest<any>(`/services/${id}/archive`, form);
};
export const publishService = (id: string) =>
  request<any>(`/services/${id}/publish`, { method: 'POST' });
export const unpublishService = (id: string) =>
  request<any>(`/services/${id}/unpublish`, { method: 'POST' });
export const updateServiceCode = (id: string, file?: File) => {
  if (file) {
    const form = new FormData();
    form.append('archive', file);
    return uploadRequest<any>(`/services/${id}/update`, form);
  }
  return request<any>(`/services/${id}/update`, { method: 'POST' });
};
export const getServiceLogs = (id: string) => request<any[]>(`/services/${id}/logs`);

/** 带 JWT 拉取二维码 PNG，转为 blob URL 供 <img> 使用（img 标签无法携带 Authorization） */
export async function fetchServiceQrCodeBlobUrl(id: string): Promise<string> {
  const token = getToken();
  const res = await fetch(`${BASE}/services/${id}/qrcode`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (res.status === 401) {
    localStorage.removeItem('token');
    window.location.href = '/login';
    throw new Error('未登录');
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || '加载二维码失败');
  }

  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export const getServicePublicUrl = (id: string) =>
  request<{ url: string }>(`/services/${id}/qrcode-url`);

/** 写入剪贴板（兼容非 HTTPS 环境） */
export async function copyTextToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
}

// Logs
export const getAllLogs = (limit?: number) =>
  request<any[]>(`/logs${limit ? `?limit=${limit}` : ''}`);

// Config
export const getConfig = () => request<{ host: string }>('/config');
export const updateConfig = (data: { host: string }) =>
  request<any>('/config', { method: 'PUT', body: JSON.stringify(data) });
