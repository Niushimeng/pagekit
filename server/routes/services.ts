import { Router, Response, NextFunction } from 'express';
import { Service } from '../models/service';
import { Log } from '../models/log';
import { AuthRequest } from '../auth';
import { publishService, unpublishService, updateService, deleteService } from '../lib/publish';
import { generateQrCodeBuffer, generateQrCodeUrl } from '../lib/qrcode';
import { listRemoteBranches, pickDefaultBranch } from '../lib/git';
import { saveArchive } from '../lib/archive';
import { archiveUpload } from '../lib/upload';

const router = Router();

function validateServiceName(name: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(name);
}

// GET /api/services/branches?git_url=...&credential_id=...
router.get('/branches', async (req: AuthRequest, res: Response) => {
  const { git_url, credential_id } = req.query;
  if (!git_url || !credential_id) {
    res.status(400).json({ error: 'Git 地址和凭证不能为空' });
    return;
  }

  try {
    const branches = await listRemoteBranches(git_url as string, credential_id as string);
    res.json({ branches, defaultBranch: pickDefaultBranch(branches) });
  } catch (err: any) {
    res.status(500).json({ error: err.message || '获取分支失败' });
  }
});

// GET /api/services
router.get('/', async (req: AuthRequest, res: Response) => {
  const list = await Service.listWithArchive();
  res.json(list);
});

// GET /api/services/:id
router.get('/:id', async (req: AuthRequest, res: Response) => {
  const service = await Service.getByIdWithArchive(req.params.id);
  if (!service) {
    res.status(404).json({ error: '服务不存在' });
    return;
  }
  res.json(service);
});

// POST /api/services
router.post('/', (req: AuthRequest, res: Response) => {
  const {
    name, source_type, git_url, credential_id, branch, publish_dir,
    auto_update_enabled, auto_update_interval,
  } = req.body;
  const type = source_type || 'git';

  if (!name) {
    res.status(400).json({ error: '服务名不能为空' });
    return;
  }

  if (!validateServiceName(name)) {
    res.status(400).json({ error: '服务名只能包含字母、数字、下划线和连字符' });
    return;
  }

  if (type !== 'git' && type !== 'zip') {
    res.status(400).json({ error: '无效的来源类型' });
    return;
  }

  if (type === 'git' && (!git_url || !credential_id)) {
    res.status(400).json({ error: 'Git 地址和凭证不能为空' });
    return;
  }

  if (Service.getByName(name)) {
    res.status(409).json({ error: '服务名已存在' });
    return;
  }

  try {
    const service = Service.create({
      name,
      source_type: type,
      git_url,
      credential_id,
      branch,
      publish_dir,
      auto_update_enabled: type === 'git' ? !!auto_update_enabled : false,
      auto_update_interval: type === 'git' ? auto_update_interval : undefined,
    });
    res.status(201).json(service);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/services/:id
router.put('/:id', (req: AuthRequest, res: Response) => {
  const {
    name, git_url, credential_id, branch, publish_dir,
    auto_update_enabled, auto_update_interval,
  } = req.body;

  if (name && !validateServiceName(name)) {
    res.status(400).json({ error: '服务名只能包含字母、数字、下划线和连字符' });
    return;
  }

  const existing = Service.getById(req.params.id);
  if (!existing) {
    res.status(404).json({ error: '服务不存在' });
    return;
  }

  // 来源类型不可变更；zip 服务忽略 git 字段
  const service = Service.update(req.params.id, {
    name,
    git_url: existing.source_type === 'git' ? git_url : undefined,
    credential_id: existing.source_type === 'git' ? credential_id : undefined,
    branch: existing.source_type === 'git' ? branch : undefined,
    publish_dir,
    auto_update_enabled: existing.source_type === 'git' && auto_update_enabled !== undefined
      ? !!auto_update_enabled
      : undefined,
    auto_update_interval: existing.source_type === 'git' ? auto_update_interval : undefined,
  });

  res.json(service);
});

// POST /api/services/:id/archive — 上传 zip 存档包
router.post('/:id/archive', (req: AuthRequest, res: Response, next: NextFunction) => {
  archiveUpload.single('archive')(req, res, (err: any) => {
    if (err) {
      const message = err.code === 'LIMIT_FILE_SIZE'
        ? `文件过大，最大 ${Math.round(req.app.locals.maxArchiveSize / 1024 / 1024)}MB`
        : (err.message || '上传失败');
      res.status(400).json({ error: message });
      return;
    }
    next();
  });
}, async (req: AuthRequest, res: Response) => {
  const service = Service.getById(req.params.id);
  if (!service) {
    res.status(404).json({ error: '服务不存在' });
    return;
  }

  if (service.source_type !== 'zip') {
    res.status(400).json({ error: '仅 Zip 服务支持上传存档包' });
    return;
  }

  if (!req.file) {
    res.status(400).json({ error: '请选择 zip 文件' });
    return;
  }

  try {
    await saveArchive(service.name, req.file.path);
    Log.create({
      service_id: service.id,
      action: 'upload',
      status: 'success',
      message: '存档包上传成功',
    });
    const updated = await Service.getByIdWithArchive(service.id);
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message || '上传失败' });
  }
});

// POST /api/services/:id/publish
router.post('/:id/publish', async (req: AuthRequest, res: Response) => {
  const service = Service.getById(req.params.id);
  if (!service) {
    res.status(404).json({ error: '服务不存在' });
    return;
  }

  try {
    await publishService(service);
    res.json({ success: true, message: '发布成功' });
  } catch (err: any) {
    Log.create({
      service_id: service.id,
      action: 'publish',
      status: 'error',
      message: err.message || '发布失败',
    });
    res.status(500).json({ error: err.message || '发布失败' });
  }
});

// POST /api/services/:id/unpublish
router.post('/:id/unpublish', async (req: AuthRequest, res: Response) => {
  const service = Service.getById(req.params.id);
  if (!service) {
    res.status(404).json({ error: '服务不存在' });
    return;
  }

  try {
    await unpublishService(service);
    res.json({ success: true, message: '已取消发布' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || '取消发布失败' });
  }
});

// POST /api/services/:id/update — zip 服务可选上传新存档包
router.post('/:id/update', (req: AuthRequest, res: Response, next: NextFunction) => {
  archiveUpload.single('archive')(req, res, (err: any) => {
    if (err) {
      const message = err.code === 'LIMIT_FILE_SIZE'
        ? '文件过大，超过上传大小限制'
        : (err.message || '上传失败');
      res.status(400).json({ error: message });
      return;
    }
    next();
  });
}, async (req: AuthRequest, res: Response) => {
  const service = Service.getById(req.params.id);
  if (!service) {
    res.status(404).json({ error: '服务不存在' });
    return;
  }

  try {
    // zip 服务：若附带新文件则先替换存档包
    if (service.source_type === 'zip' && req.file) {
      await saveArchive(service.name, req.file.path);
    }

    await updateService(service);
    res.json({ success: true, message: '更新成功' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || '更新失败' });
  }
});

// DELETE /api/services/:id
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  const service = Service.getById(req.params.id);
  if (!service) {
    res.status(404).json({ error: '服务不存在' });
    return;
  }

  try {
    await deleteService(service);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || '删除失败' });
  }
});

// GET /api/services/:id/qrcode
router.get('/:id/qrcode', async (req: AuthRequest, res: Response) => {
  const service = Service.getById(req.params.id);
  if (!service) {
    res.status(404).json({ error: '服务不存在' });
    return;
  }

  try {
    const buffer = await generateQrCodeBuffer(service.name);
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(buffer);
  } catch (err: any) {
    res.status(500).json({ error: '生成二维码失败' });
  }
});

// GET /api/services/:id/qrcode-url
router.get('/:id/qrcode-url', (req: AuthRequest, res: Response) => {
  const service = Service.getById(req.params.id);
  if (!service) {
    res.status(404).json({ error: '服务不存在' });
    return;
  }
  res.json({ url: generateQrCodeUrl(service.name) });
});

// GET /api/services/:id/logs
router.get('/:id/logs', (req: AuthRequest, res: Response) => {
  const logs = Log.listByService(req.params.id);
  res.json(logs);
});

export default router;
