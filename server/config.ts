import path from 'path';
import fs from 'fs';
import { AppConfig } from './types';

const configPath = path.resolve(__dirname, '..', 'config.json');
const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

const config: AppConfig = {
  ...raw,
  dataDir: path.resolve(__dirname, '..', raw.dataDir),
};

export default config;
