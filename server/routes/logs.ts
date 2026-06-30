import { Router, Response } from 'express';
import { Log } from '../models/log';
import config from '../config';
import { AuthRequest } from '../auth';

const router = Router();

// GET /api/logs
router.get('/', (req: AuthRequest, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 100;
  const logs = Log.listAll(limit);
  res.json(logs);
});

// GET /api/config
router.get('/', (req: AuthRequest, res: Response) => {
  res.json({
    host: config.host,
  });
});

export default router;
