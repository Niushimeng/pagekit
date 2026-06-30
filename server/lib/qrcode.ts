import QRCode from 'qrcode';
import config from '../config';

export function generateQrCodeUrl(serviceName: string): string {
  // 去掉 host 尾部斜杠，服务路径以 / 结尾（与 Nginx 目录访问一致，避免 301 丢端口）
  const base = config.host.replace(/\/+$/, '');
  return `${base}/${serviceName}/`;
}

export async function generateQrCodeBuffer(serviceName: string): Promise<Buffer> {
  const url = generateQrCodeUrl(serviceName);
  return QRCode.toBuffer(url, {
    type: 'png',
    width: 300,
    margin: 2,
    color: {
      dark: '#000000',
      light: '#ffffff',
    },
  });
}
