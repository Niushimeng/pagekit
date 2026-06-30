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
  git_url: string;
  credential_id: string;
  branch: string;
  publish_dir: string;
  status: 'unpublished' | 'published';
  webhook_secret: string | null;
  webhook_id: string | null;
  last_publish_at: string | null;
  last_update_at: string | null;
  created_at: string;
  updated_at: string;
  credential_name?: string;
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
