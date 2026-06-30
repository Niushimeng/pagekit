import path from 'path';
import fs from 'fs-extra';
import config from '../config';
import { Service } from '../models/service';
import { Log } from '../models/log';
import { cloneRepo, pullRepo, setupWebhook, deleteWebhook } from './git';
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

async function copyPublishDir(repoDir: string, publishDir: string, targetDir: string): Promise<void> {
  const source = publishDir ? path.join(repoDir, publishDir) : repoDir;
  if (!await fs.pathExists(source)) {
    throw new Error(`发布目录不存在: ${publishDir}`);
  }
  await fs.ensureDir(targetDir);
  await fs.copy(source, targetDir);
}

async function atomicSwitch(serviceName: string, tmpDir: string): Promise<void> {
  const servePath = getServiceServePath(serviceName);
  const oldPath = getServiceOldPath(serviceName);

  // Remove old backup if exists
  await fs.remove(oldPath);

  // Move current to backup
  if (await fs.pathExists(servePath)) {
    await fs.rename(servePath, oldPath);
  }

  // Move tmp to serve
  await fs.rename(tmpDir, servePath);

  // Clean up backup
  await fs.remove(oldPath);
}

export async function publishService(service: ServiceRow): Promise<void> {
  const cacheDir = getServiceCachePath(service.name);
  const tmpDir = getServiceTmpPath(service.name);

  // Clone repo to cache
  await cloneRepo(service, cacheDir);

  // Copy publish dir to tmp
  await fs.remove(tmpDir);
  await copyPublishDir(cacheDir, service.publish_dir, tmpDir);

  // Atomic switch
  await atomicSwitch(service.name, tmpDir);

  // Update status
  Service.updateStatus(service.id, 'published');

  // Setup webhook
  const webhookId = await setupWebhook(service);
  if (webhookId) {
    Service.setWebhookId(service.id, webhookId);
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

  // Remove published files
  await fs.remove(servePath);

  // Remove cached repo
  const cacheDir = getServiceCachePath(service.name);
  await fs.remove(cacheDir);

  // Delete webhook from Gogs
  await deleteWebhook(service);
  Service.setWebhookId(service.id, null);

  // Update status
  Service.updateStatus(service.id, 'unpublished');

  Log.create({
    service_id: service.id,
    action: 'unpublish',
    status: 'success',
    message: '已取消发布',
  });
}

export async function updateService(service: ServiceRow): Promise<void> {
  const cacheDir = getServiceCachePath(service.name);
  const tmpDir = getServiceTmpPath(service.name);

  // If cache doesn't exist, do a full publish
  if (!await fs.pathExists(cacheDir)) {
    await publishService(service);
    return;
  }

  try {
    // Pull latest in cache
    await pullRepo(cacheDir, service);

    // Copy publish dir to tmp
    await fs.remove(tmpDir);
    await copyPublishDir(cacheDir, service.publish_dir, tmpDir);

    // Atomic switch
    await atomicSwitch(service.name, tmpDir);

    // Update timestamp
    Service.updateLastUpdate(service.id);

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

  // Remove all files
  await Promise.all([
    fs.remove(servePath),
    fs.remove(cacheDir),
    fs.remove(tmpDir),
  ]);

  // Delete webhook
  await deleteWebhook(service);

  // Delete from DB (logs cascade)
  Service.delete(service.id);
}
