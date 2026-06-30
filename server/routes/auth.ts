import { Router, Request, Response } from 'express';
import { generateToken, verifyPassword } from '../auth';
import config from '../config';

const router = Router();

// POST /api/auth/login
router.post('/login', (req: Request, res: Response) => {
  const { username, password } = req.body;

  if (!username || !password) {
    res.status(400).json({ error: '请输入用户名和密码' });
    return;
  }

  if (username !== config.admin.username || !verifyPassword(password)) {
    res.status(401).json({ error: '用户名或密码错误' });
    return;
  }

  const token = generateToken();
  res.json({ token, username });
});

// GET /api/auth/me
router.get('/me', (req: Request, res: Response) => {
  // This will be protected by auth middleware in the main app
  res.json({ username: (req as any).user?.username });
});

export default router;
