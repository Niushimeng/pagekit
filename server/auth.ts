import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import config from './config';

export interface AuthRequest extends Request {
  user?: { username: string };
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: '未登录' });
    return;
  }

  try {
    const token = header.slice(7);
    const payload = jwt.verify(token, config.jwtSecret) as { username: string };
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: '登录已过期，请重新登录' });
  }
}

export function generateToken(): string {
  return jwt.sign({ username: config.admin.username }, config.jwtSecret, { expiresIn: '7d' });
}

export function verifyPassword(password: string): boolean {
  return password === config.admin.password;
}
