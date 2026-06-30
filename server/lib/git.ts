import simpleGit, { SimpleGit } from 'simple-git';
import path from 'path';
import fs from 'fs-extra';
import config from '../config';
import { ServiceRow } from '../types';
import { Credential } from '../models/credential';

function buildGitUrl(gitUrl: string, username: string, password: string): string {
  // Insert credentials into git URL: https://user:pass@host/repo.git
  const url = new URL(gitUrl);
  url.username = encodeURIComponent(username);
  url.password = encodeURIComponent(password);
  return url.toString();
}

/** 解析 git ls-remote 输出为分支名列表 */
function parseRemoteBranchOutput(output: string): string[] {
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const ref = line.split('\t')[1];
      if (ref?.startsWith('refs/heads/')) {
        return ref.slice('refs/heads/'.length);
      }
      return null;
    })
    .filter((name): name is string => !!name)
    .sort((a, b) => a.localeCompare(b));
}

/** 从远程仓库获取分支列表 */
export async function listRemoteBranches(gitUrl: string, credentialId: string): Promise<string[]> {
  const cred = Credential.getByIdWithPassword(credentialId);
  if (!cred) throw new Error('凭证不存在');

  const authUrl = buildGitUrl(gitUrl, cred.username, cred.password);
  const git = simpleGit();
  // listRemote 返回原始字符串，不是对象
  const output = await git.listRemote(['--heads', authUrl]);
  return parseRemoteBranchOutput(output);
}

/** 优先选择 main / master 等常见默认分支 */
export function pickDefaultBranch(branches: string[]): string | null {
  if (branches.length === 0) return null;
  const preferred = ['main', 'master', 'develop'];
  for (const name of preferred) {
    if (branches.includes(name)) return name;
  }
  return branches[0];
}

export async function cloneRepo(service: ServiceRow, targetDir: string): Promise<SimpleGit> {
  const cred = Credential.getByIdWithPassword(service.credential_id);
  if (!cred) throw new Error('凭证不存在');

  const authUrl = buildGitUrl(service.git_url, cred.username, cred.password);

  // Clean target dir if exists
  await fs.remove(targetDir);
  await fs.ensureDir(targetDir);

  const git = simpleGit();
  await git.clone(authUrl, targetDir, ['--branch', service.branch, '--single-branch', '--depth', '1']);
  return simpleGit(targetDir);
}

export async function pullRepo(repoDir: string, service: ServiceRow): Promise<void> {
  const cred = Credential.getByIdWithPassword(service.credential_id);
  if (!cred) throw new Error('凭证不存在');

  const authUrl = buildGitUrl(service.git_url, cred.username, cred.password);
  const git = simpleGit(repoDir);

  // Update remote URL with fresh credentials
  await git.remote(['set-url', 'origin', authUrl]);
  await git.pull('origin', service.branch);
}

export async function setupWebhook(service: ServiceRow): Promise<string | null> {
  const cred = Credential.getByIdWithPassword(service.credential_id);
  if (!cred) return null;

  try {
    const gitUrlObj = new URL(service.git_url);
    const apiBase = `${gitUrlObj.protocol}//${gitUrlObj.host}`;
    const pathParts = gitUrlObj.pathname.replace(/^\//, '').replace(/\.git$/, '').split('/');
    if (pathParts.length < 2) return null;

    const owner = pathParts[0];
    const repo = pathParts[1];
    const webhookUrl = `${config.host}/api/webhook/${service.id}/${service.webhook_secret}`;

    const response = await fetch(`${apiBase}/api/v1/repos/${owner}/${repo}/hooks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${Buffer.from(`${cred.username}:${cred.password}`).toString('base64')}`,
      },
      body: JSON.stringify({
        type: 'gogs',
        config: {
          url: webhookUrl,
          content_type: 'json',
          secret: service.webhook_secret || '',
        },
        events: ['push'],
        active: true,
      }),
    });

    if (!response.ok) {
      console.error('Failed to create webhook:', await response.text());
      return null;
    }

    const data = await response.json() as { id?: number };
    return data.id?.toString() || null;
  } catch (err) {
    console.error('Webhook setup error:', err);
    return null;
  }
}

export async function deleteWebhook(service: ServiceRow): Promise<void> {
  if (!service.webhook_id) return;

  const cred = Credential.getByIdWithPassword(service.credential_id);
  if (!cred) return;

  try {
    const gitUrlObj = new URL(service.git_url);
    const apiBase = `${gitUrlObj.protocol}//${gitUrlObj.host}`;
    const pathParts = gitUrlObj.pathname.replace(/^\//, '').replace(/\.git$/, '').split('/');
    if (pathParts.length < 2) return;

    const owner = pathParts[0];
    const repo = pathParts[1];

    await fetch(`${apiBase}/api/v1/repos/${owner}/${repo}/hooks/${service.webhook_id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${cred.username}:${cred.password}`).toString('base64')}`,
      },
    });
  } catch (err) {
    console.error('Webhook delete error:', err);
  }
}
