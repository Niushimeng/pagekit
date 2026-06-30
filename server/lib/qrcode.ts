import QRCode from 'qrcode';
import config from '../config';

export function generateQrCodeUrl(serviceName: string): string {
  return `${config.host}/${serviceName}`;
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
