import path from 'path';
import fs from 'fs-extra';
import config from '../config';
import { Service } from '../models/service';
import { Log } from '../models/log';
import { cloneRepo, pullRepo, setupWebhook, deleteWebhook, getRepoCommitHash } from './git';
import { extractArchive, hasArchive, removeArchive } from './archive';
import { ServiceRow } from '../types';

export type UpdateSource = 'manual' | 'webhook' | 'scheduled';

/** 服务级更新锁，防止并发 pull/切换 */
const updatingServices = new Set<string>();

function getServiceServePath(serviceName: string): string {
  return path.join(config.publishDir, serviceName);
}

function getServiceTmpPath(serviceName: string): string {
  return path.join(config.tmpDir, serviceName);
}

function getServiceOldPath(serviceName: string): string {
  return path.join(config.oldDir, serviceName);
}

function getServiceCachePath(serviceName: string): string {
  return path.join(config.dataDir, 'repos', serviceName);
}

async function copyPublishDir(sourceRoot: string, publishDir: string, targetDir: string): Promise<void> {
  const source = publishDir ? path.join(sourceRoot, publishDir) : sourceRoot;
  if (!await fs.pathExists(source)) {
    throw new Error(`发布目录不存在: ${publishDir || '(根目录)'}`);
  }
  await fs.ensureDir(targetDir);
  await fs.copy(source, targetDir);
}

async function atomicSwitch(serviceName: string, tmpDir: string): Promise<void> {
  const servePath = getServiceServePath(serviceName);
  const oldPath = getServiceOldPath(serviceName);

  await fs.remove(oldPath);

  if (await fs.pathExists(servePath)) {
    await fs.rename(servePath, oldPath);
  }

  await fs.rename(tmpDir, servePath);
  await fs.remove(oldPath);
}

async function switchGitPublishDir(
  service: ServiceRow,
  cacheDir: string,
  commitHash: string
): Promise<void> {
  const tmpDir = getServiceTmpPath(service.name);
  await fs.remove(tmpDir);
  await copyPublishDir(cacheDir, service.publish_dir, tmpDir);
  await atomicSwitch(service.name, tmpDir);
  Service.setLastDeployedCommit(service.id, commitHash);
}

async function publishGitService(service: ServiceRow): Promise<void> {
  const cacheDir = getServiceCachePath(service.name);

  await cloneRepo(service, cacheDir);
  const commitHash = await getRepoCommitHash(cacheDir);
  await switchGitPublishDir(service, cacheDir, commitHash);

  Service.updateStatus(service.id, 'published');

  const webhookId = await setupWebhook(service);
  if (webhookId) {
    Service.setWebhookId(service.id, webhookId);
  }
}

async function publishZipService(service: ServiceRow): Promise<void> {
  if (!await hasArchive(service.name)) {
    throw new Error('存档包不存在，请先上传 zip 文件');
  }

  const tmpDir = getServiceTmpPath(service.name);
  const extractDir = await extractArchive(service.name);

  await fs.remove(tmpDir);
  await copyPublishDir(extractDir, service.publish_dir, tmpDir);
  await atomicSwitch(service.name, tmpDir);

  Service.updateStatus(service.id, 'published');
}

export async function publishService(service: ServiceRow): Promise<void> {
  if (service.source_type === 'zip') {
    await publishZipService(service);
  } else {
    await publishGitService(service);
  }

  Log.create({
    service_id: service.id,
    action: 'publish',
    status: 'success',
    message: '发布成功',
  });
}

export async function unpublishService(service: ServiceRow): Promise<void> {
  const servePath = getServiceServePath(service.name);
  await fs.remove(servePath);

  if (service.source_type === 'git') {
    const cacheDir = getServiceCachePath(service.name);
    await fs.remove(cacheDir);
    await deleteWebhook(service);
    Service.setWebhookId(service.id, null);
  }

  Service.updateStatus(service.id, 'unpublished');

  Log.create({
    service_id: service.id,
    action: 'unpublish',
    status: 'success',
    message: '已取消发布',
  });
}

/** Git 更新：pull 后比对 commit，有变才切换 */
async function updateGitServiceInternal(service: ServiceRow): Promise<'updated' | 'unchanged'> {
  const cacheDir = getServiceCachePath(service.name);

  await pullRepo(cacheDir, service);
  const commitHash = await getRepoCommitHash(cacheDir);

  if (service.last_deployed_commit && service.last_deployed_commit === commitHash) {
    return 'unchanged';
  }

  await switchGitPublishDir(service, cacheDir, commitHash);
  Service.updateLastUpdate(service.id);
  return 'updated';
}

async function updateZipService(service: ServiceRow): Promise<void> {
  if (!await hasArchive(service.name)) {
    throw new Error('存档包不存在，请先上传 zip 文件');
  }

  const tmpDir = getServiceTmpPath(service.name);
  const extractDir = await extractArchive(service.name);

  await fs.remove(tmpDir);
  await copyPublishDir(extractDir, service.publish_dir, tmpDir);
  await atomicSwitch(service.name, tmpDir);
  Service.updateLastUpdate(service.id);
}

function logUpdateResult(
  service: ServiceRow,
  source: UpdateSource,
  result: 'updated' | 'unchanged',
  status: 'success' | 'error' = 'success',
  message?: string
): void {
  if (source === 'scheduled') {
    if (result === 'unchanged') return;
    Log.create({
      service_id: service.id,
      action: 'scheduled',
      status,
      message: message || (status === 'success' ? '定时更新成功' : '定时更新失败'),
    });
    return;
  }

  const action = 'update';
  if (result === 'unchanged') {
    Log.create({
      service_id: service.id,
      action,
      status: 'success',
      message: message || '已是最新版本',
    });
    return;
  }

  Log.create({
    service_id: service.id,
    action,
    status,
    message: message || '更新成功',
  });
}

export async function updateService(service: ServiceRow, source: UpdateSource = 'manual'): Promise<void> {
  if (updatingServices.has(service.id)) {
    return;
  }

  updatingServices.add(service.id);
  try {
    if (service.source_type === 'zip') {
      await updateZipService(service);
      logUpdateResult(service, source, 'updated');
      return;
    }

    const cacheDir = getServiceCachePath(service.name);
    if (!await fs.pathExists(cacheDir)) {
      updatingServices.delete(service.id);
      await publishService(service);
      return;
    }

    const result = await updateGitServiceInternal(service);
    logUpdateResult(service, source, result);
  } catch (err: any) {
    if (source === 'scheduled') {
      Log.create({
        service_id: service.id,
        action: 'scheduled',
        status: 'error',
        message: err.message || '定时更新失败',
      });
    } else {
      Log.create({
        service_id: service.id,
        action: 'update',
        status: 'error',
        message: err.message || '更新失败',
      });
    }
    throw err;
  } finally {
    updatingServices.delete(service.id);
  }
}

export async function deleteService(service: ServiceRow): Promise<void> {
  const servePath = getServiceServePath(service.name);
  const cacheDir = getServiceCachePath(service.name);
  const tmpDir = getServiceTmpPath(service.name);

  await Promise.all([
    fs.remove(servePath),
    fs.remove(cacheDir),
    fs.remove(tmpDir),
  ]);

  if (service.source_type === 'git') {
    await deleteWebhook(service);
  } else {
    await removeArchive(service.name);
  }

  Service.delete(service.id);
}
