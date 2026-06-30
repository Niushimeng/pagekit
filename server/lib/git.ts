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
