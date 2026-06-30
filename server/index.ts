import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import config from './config';
import { authMiddleware, AuthRequest } from './auth';
import authRoutes from './routes/auth';
import credentialRoutes from './routes/credentials';
import serviceRoutes from './routes/services';
import webhookRoutes from './routes/webhook';
import logRoutes from './routes/logs';
import configRoutes from './routes/config';

const app = express();

app.use(cors());
app.use(express.json());
app.locals.maxArchiveSize = config.maxArchiveSize;

// Public routes
app.use('/api/auth', authRoutes);
app.use('/api/webhook', webhookRoutes);

// Protected routes
app.use('/api/credentials', authMiddleware, credentialRoutes);
app.use('/api/services', authMiddleware, serviceRoutes);
app.use('/api/logs', authMiddleware, logRoutes);
app.use('/api/config', authMiddleware, configRoutes);

// Auth check endpoint
app.get('/api/auth/me', authMiddleware, (req: AuthRequest, res) => {
  res.json({ username: req.user?.username });
});

// Serve static frontend (production)
const clientDist = path.resolve(__dirname, '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.listen(config.port, () => {
  console.log(`Pagekit server running on port ${config.port}`);
  console.log(`Host: ${config.host}`);
});
