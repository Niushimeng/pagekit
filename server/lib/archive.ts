import path from 'path';
import fs from 'fs-extra';
import yauzl from 'yauzl';
import config from '../config';

/** 存档包目录：<dataDir>/archives/<service-name>/ */
export function getArchiveDir(serviceName: string): string {
  return path.join(config.dataDir, 'archives', serviceName);
}

export function getArchiveZipPath(serviceName: string): string {
  return path.join(getArchiveDir(serviceName), 'package.zip');
}

export function getArchiveExtractPath(serviceName: string): string {
  return path.join(getArchiveDir(serviceName), 'extracted');
}

/** 检查是否已有存档包 */
export async function hasArchive(serviceName: string): Promise<boolean> {
  return fs.pathExists(getArchiveZipPath(serviceName));
}

/** 保存上传的 zip 为存档包 */
export async function saveArchive(serviceName: string, tempFilePath: string): Promise<void> {
  const archiveDir = getArchiveDir(serviceName);
  await fs.ensureDir(archiveDir);
  const dest = getArchiveZipPath(serviceName);
  await fs.move(tempFilePath, dest, { overwrite: true });
}

/** 删除存档包及解压缓存 */
export async function removeArchive(serviceName: string): Promise<void> {
  await fs.remove(getArchiveDir(serviceName));
}

/** 校验 zip 内条目路径，防止 Zip Slip */
function assertSafeEntryPath(entryName: string, destDir: string): string {
  if (entryName.includes('\0')) {
    throw new Error(`不安全的 zip 路径: ${entryName}`);
  }
  const destPath = path.resolve(destDir, entryName);
  const destRoot = path.resolve(destDir);
  if (destPath !== destRoot && !destPath.startsWith(destRoot + path.sep)) {
    throw new Error(`路径穿越检测: ${entryName}`);
  }
  return destPath;
}

/** 将存档包解压到 extracted 目录（原样解压） */
export async function extractArchive(serviceName: string): Promise<string> {
  const zipPath = getArchiveZipPath(serviceName);
  if (!await fs.pathExists(zipPath)) {
    throw new Error('存档包不存在，请先上传 zip 文件');
  }

  const extractDir = getArchiveExtractPath(serviceName);
  await fs.remove(extractDir);
  await fs.ensureDir(extractDir);

  await new Promise<void>((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
      if (err || !zipfile) {
        reject(err || new Error('无法打开 zip 文件'));
        return;
      }

      zipfile.readEntry();

      zipfile.on('entry', (entry) => {
        let destPath: string;
        try {
          destPath = assertSafeEntryPath(entry.fileName, extractDir);
        } catch (e) {
          zipfile.close();
          reject(e);
          return;
        }

        if (/\/$/.test(entry.fileName)) {
          fs.ensureDir(destPath)
            .then(() => zipfile.readEntry())
            .catch((e) => {
              zipfile.close();
              reject(e);
            });
          return;
        }

        zipfile.openReadStream(entry, (streamErr, readStream) => {
          if (streamErr || !readStream) {
            zipfile.close();
            reject(streamErr || new Error('无法读取 zip 条目'));
            return;
          }

          fs.ensureDir(path.dirname(destPath))
            .then(() => {
              const writeStream = fs.createWriteStream(destPath);
              readStream.on('error', (e) => {
                zipfile.close();
                reject(e);
              });
              writeStream.on('error', (e) => {
                zipfile.close();
                reject(e);
              });
              writeStream.on('finish', () => zipfile.readEntry());
              readStream.pipe(writeStream);
            })
            .catch((e) => {
              zipfile.close();
              reject(e);
            });
        });
      });

      zipfile.on('end', () => resolve());
      zipfile.on('error', (e) => reject(e));
    });
  });

  return extractDir;
}
