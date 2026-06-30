import path from 'path';
import fs from 'fs-extra';
import config from '../config';
import { Service } from '../models/service';
import { Log } from '../models/log';
import { cloneRepo, pullRepo, setupWebhook, deleteWebhook } from './git';
import { extractArchive, hasArchive, removeArchive } from './archive';
import { ServiceRow } from '../types';

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

async function publishGitService(service: ServiceRow): Promise<void> {
  const cacheDir = getServiceCachePath(service.name);
  const tmpDir = getServiceTmpPath(service.name);

  await cloneRepo(service, cacheDir);
  await fs.remove(tmpDir);
  await copyPublishDir(cacheDir, service.publish_dir, tmpDir);
  await atomicSwitch(service.name, tmpDir);

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
  // zip 服务保留存档包，便于重新发布

  Service.updateStatus(service.id, 'unpublished');

  Log.create({
    service_id: service.id,
    action: 'unpublish',
    status: 'success',
    message: '已取消发布',
  });
}

async function updateGitService(service: ServiceRow): Promise<void> {
  const cacheDir = getServiceCachePath(service.name);
  const tmpDir = getServiceTmpPath(service.name);

  await pullRepo(cacheDir, service);
  await fs.remove(tmpDir);
  await copyPublishDir(cacheDir, service.publish_dir, tmpDir);
  await atomicSwitch(service.name, tmpDir);
  Service.updateLastUpdate(service.id);
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

export async function updateService(service: ServiceRow): Promise<void> {
  try {
    if (service.source_type === 'zip') {
      await updateZipService(service);
    } else {
      const cacheDir = getServiceCachePath(service.name);
      // 缓存不存在时走完整发布流程
      if (!await fs.pathExists(cacheDir)) {
        await publishService(service);
        return;
      }
      await updateGitService(service);
    }

    Log.create({
      service_id: service.id,
      action: 'update',
      status: 'success',
      message: '更新成功',
    });
  } catch (err: any) {
    Log.create({
      service_id: service.id,
      action: 'update',
      status: 'error',
      message: err.message || '更新失败',
    });
    throw err;
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
