import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { Service } from '../models/service';
import { Log } from '../models/log';
import { updateService } from '../lib/publish';

const router = Router();

// POST /api/webhook/:serviceId/:secret
router.post('/:serviceId/:secret', async (req: Request, res: Response) => {
  const { serviceId, secret } = req.params;

  const service = Service.getById(serviceId);
  if (!service) {
    res.status(404).json({ error: '服务不存在' });
    return;
  }

  // Verify webhook secret matches
  if (service.webhook_secret !== secret) {
    res.status(403).json({ error: '密钥无效' });
    return;
  }

  // Verify HMAC signature if Gogs sends one
  const signature = req.headers['x-gogs-signature'] as string | undefined;
  if (signature && service.webhook_secret) {
    const hmac = crypto.createHmac('sha256', service.webhook_secret);
    hmac.update(JSON.stringify(req.body));
    const expectedSig = hmac.digest('hex');
    if (signature !== expectedSig) {
      res.status(403).json({ error: '签名验证失败' });
      return;
    }
  }

  // Only handle push events
  const eventType = req.headers['x-gogs-event'] as string || '';
  if (eventType && eventType !== 'push') {
    res.json({ message: '忽略非 push 事件' });
    return;
  }

  // Check if the pushed branch matches
  const ref = req.body?.ref as string | undefined;
  if (ref) {
    const pushedBranch = ref.replace('refs/heads/', '');
    if (pushedBranch !== service.branch) {
      res.json({ message: `忽略非目标分支推送: ${pushedBranch}` });
      return;
    }
  }

  // Trigger update asynchronously
  Log.create({
    service_id: service.id,
    action: 'webhook',
    status: 'success',
    message: '收到 webhook 回调，开始更新',
  });

  updateService(service).catch((err) => {
    console.error(`Webhook update failed for ${service.name}:`, err.message);
  });

  res.json({ message: '已触发更新' });
});

export default router;
