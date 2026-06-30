import { Router, Response } from 'express';
import { Service } from '../models/service';
import { Log } from '../models/log';
import { AuthRequest } from '../auth';
import { publishService, unpublishService, updateService, deleteService } from '../lib/publish';
import { generateQrCodeBuffer, generateQrCodeUrl } from '../lib/qrcode';
import { listRemoteBranches, pickDefaultBranch } from '../lib/git';

const router = Router();

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
router.get('/', (req: AuthRequest, res: Response) => {
  const list = Service.list();
  res.json(list);
});

// GET /api/services/:id
router.get('/:id', (req: AuthRequest, res: Response) => {
  const service = Service.getById(req.params.id);
  if (!service) {
    res.status(404).json({ error: '服务不存在' });
    return;
  }
  res.json(service);
});

// POST /api/services
router.post('/', (req: AuthRequest, res: Response) => {
  const { name, git_url, credential_id, branch, publish_dir } = req.body;
  if (!name || !git_url || !credential_id) {
    res.status(400).json({ error: '服务名、Git 地址和凭证不能为空' });
    return;
  }

  // Validate service name (URL-safe)
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    res.status(400).json({ error: '服务名只能包含字母、数字、下划线和连字符' });
    return;
  }

  if (Service.getByName(name)) {
    res.status(409).json({ error: '服务名已存在' });
    return;
  }

  try {
    const service = Service.create({ name, git_url, credential_id, branch, publish_dir });
    res.status(201).json(service);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/services/:id
router.put('/:id', (req: AuthRequest, res: Response) => {
  const { name, git_url, credential_id, branch, publish_dir } = req.body;

  if (name && !/^[a-zA-Z0-9_-]+$/.test(name)) {
    res.status(400).json({ error: '服务名只能包含字母、数字、下划线和连字符' });
    return;
  }

  const service = Service.update(req.params.id, { name, git_url, credential_id, branch, publish_dir });
  if (!service) {
    res.status(404).json({ error: '服务不存在' });
    return;
  }
  res.json(service);
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

// POST /api/services/:id/update
router.post('/:id/update', async (req: AuthRequest, res: Response) => {
  const service = Service.getById(req.params.id);
  if (!service) {
    res.status(404).json({ error: '服务不存在' });
    return;
  }

  try {
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
