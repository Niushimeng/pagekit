import { Router, Response } from 'express';
import { Credential } from '../models/credential';
import { AuthRequest } from '../auth';

const router = Router();

// GET /api/credentials
router.get('/', (req: AuthRequest, res: Response) => {
  const list = Credential.list();
  res.json(list);
});

// POST /api/credentials
router.post('/', (req: AuthRequest, res: Response) => {
  const { name, username, password } = req.body;
  if (!name || !username || !password) {
    res.status(400).json({ error: '名称、用户名和密码不能为空' });
    return;
  }

  try {
    const cred = Credential.create({ name, username, password });
    res.status(201).json(cred);
  } catch (err: any) {
    if (err.message?.includes('UNIQUE')) {
      res.status(409).json({ error: '凭证名称已存在' });
    } else {
      res.status(500).json({ error: err.message });
    }
  }
});

// PUT /api/credentials/:id
router.put('/:id', (req: AuthRequest, res: Response) => {
  const { name, username, password } = req.body;
  const cred = Credential.update(req.params.id, { name, username, password });
  if (!cred) {
    res.status(404).json({ error: '凭证不存在' });
    return;
  }
  res.json(cred);
});

// DELETE /api/credentials/:id
router.delete('/:id', (req: AuthRequest, res: Response) => {
  try {
    Credential.delete(req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
