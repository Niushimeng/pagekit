import path from 'path';
import fs from 'fs';
import { AppConfig } from './types';

const configPath = path.resolve(__dirname, '..', 'config.json');
const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

/** 相对路径基于项目根目录解析，绝对路径保持不变（Docker 部署用） */
function resolveConfigPath(value: string): string {
  if (path.isAbsolute(value)) return value;
  return path.resolve(__dirname, '..', value);
}

const config: AppConfig = {
  ...raw,
  dataDir: resolveConfigPath(raw.dataDir),
  publishDir: resolveConfigPath(raw.publishDir),
  tmpDir: resolveConfigPath(raw.tmpDir),
  oldDir: resolveConfigPath(raw.oldDir),
};

export default config;
