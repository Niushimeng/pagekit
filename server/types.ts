export type SourceType = 'git' | 'zip';

export interface AppConfig {
  port: number;
  host: string;
  admin: {
    username: string;
    password: string;
  };
  jwtSecret: string;
  dataDir: string;
  publishDir: string;
  tmpDir: string;
  oldDir: string;
  /** zip 上传大小上限（字节），默认 50MB */
  maxArchiveSize: number;
}

export interface CredentialRow {
  id: string;
  name: string;
  username: string;
  password_encrypted: string;
  created_at: string;
  updated_at: string;
}

export interface ServiceRow {
  id: string;
  name: string;
  source_type: SourceType;
  git_url: string | null;
  credential_id: string | null;
  branch: string | null;
  publish_dir: string;
  status: 'unpublished' | 'published';
  webhook_secret: string | null;
  webhook_id: string | null;
  last_publish_at: string | null;
  last_update_at: string | null;
  created_at: string;
  updated_at: string;
  credential_name?: string;
  /** 是否已有存档包（仅 zip 服务，运行时计算） */
  has_archive?: boolean;
}

export interface LogRow {
  id: number;
  service_id: string;
  action: string;
  status: 'success' | 'error';
  message: string | null;
  created_at: string;
  service_name?: string;
}
