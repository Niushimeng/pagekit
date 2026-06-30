import { Router, Response } from 'express';
import config from '../config';
import { AuthRequest } from '../auth';

const router = Router();

// GET /api/config
router.get('/', (req: AuthRequest, res: Response) => {
  res.json({
    host: config.host,
  });
});

// PUT /api/config
router.put('/', (req: AuthRequest, res: Response) => {
  const { host } = req.body;
  if (host !== undefined) {
    config.host = host;
  }
  res.json({ host: config.host });
});

export default router;
