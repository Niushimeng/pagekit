import multer from 'multer';
import path from 'path';
import fs from 'fs-extra';
import os from 'os';
import config from '../config';

const uploadDir = path.join(os.tmpdir(), 'pagekit-uploads');
fs.ensureDirSync(uploadDir);

/** zip 上传：磁盘临时存储，大小受 config.maxArchiveSize 限制 */
export const archiveUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, _file, cb) => cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}.zip`),
  }),
  limits: { fileSize: config.maxArchiveSize },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== '.zip') {
      cb(new Error('仅支持 .zip 文件'));
      return;
    }
    cb(null, true);
  },
});
