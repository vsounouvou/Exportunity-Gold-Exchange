import QRCode from 'qrcode';
import { customAlphabet } from 'nanoid';
import path from 'path';
import fs from 'fs/promises';

const nanoid = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz', 12);

export interface QRCodeOptions {
  errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
  width?: number;
  margin?: number;
  color?: {
    dark?: string;
    light?: string;
  };
}

export interface QRCodeResult {
  qrCode: string; // Base64 PNG
  qrCodeUrl: string; // Public URL
  identifier: string; // Unique code
}

const QR_STORAGE_DIR = path.join(process.cwd(), 'attached_assets', 'qr_codes');

async function ensureQRDirectory() {
  try {
    await fs.mkdir(QR_STORAGE_DIR, { recursive: true });
  } catch (error) {
    console.error('[QR] Failed to create QR directory:', error);
  }
}

export async function generateQRCode(
  data: string,
  options: QRCodeOptions = {}
): Promise<QRCodeResult> {
  const defaultOptions = {
    errorCorrectionLevel: 'H' as const,
    width: 512,
    margin: 2,
    color: {
      dark: '#000000',
      light: '#FFFFFF'
    }
  };

  const qrOptions = { ...defaultOptions, ...options };
  
  try {
    // Generate QR code as base64 PNG
    const qrCodeBase64 = await QRCode.toDataURL(data, qrOptions);
    
    // Generate unique identifier
    const identifier = nanoid();
    
    // Save to file system
    await ensureQRDirectory();
    const filename = `qr_${identifier}.png`;
    const filePath = path.join(QR_STORAGE_DIR, filename);
    
    // Extract base64 data and save
    const base64Data = qrCodeBase64.replace(/^data:image\/png;base64,/, '');
    await fs.writeFile(filePath, base64Data, 'base64');
    
    const qrCodeUrl = `/qr-codes/${filename}`;
    
    console.log('[QR] Generated QR code:', { identifier, url: qrCodeUrl });
    
    return {
      qrCode: qrCodeBase64,
      qrCodeUrl,
      identifier
    };
  } catch (error) {
    console.error('[QR] Error generating QR code:', error);
    throw new Error('Failed to generate QR code');
  }
}

export async function generateCompanyQR(companyId: number, companySlug?: string): Promise<QRCodeResult> {
  const baseUrl = process.env.VITE_PUBLIC_URL || 'https://your-platform.com';
  const url = companySlug 
    ? `${baseUrl}/marketplace/company/${companySlug}`
    : `${baseUrl}/marketplace/company/${companyId}`;
  
  return generateQRCode(url, {
    color: {
      dark: '#3B82F6', // Blue
      light: '#FFFFFF'
    }
  });
}

export async function generateProductQR(productId: number): Promise<QRCodeResult> {
  const baseUrl = process.env.VITE_PUBLIC_URL || 'https://your-platform.com';
  const url = `${baseUrl}/marketplace/product/${productId}`;
  
  return generateQRCode(url);
}

export async function generateServiceQR(serviceId: number): Promise<QRCodeResult> {
  const baseUrl = process.env.VITE_PUBLIC_URL || 'https://your-platform.com';
  const url = `${baseUrl}/marketplace/service/${serviceId}`;
  
  return generateQRCode(url);
}

export async function generateUserQR(userId: number): Promise<QRCodeResult> {
  const baseUrl = process.env.VITE_PUBLIC_URL || 'https://your-platform.com';
  const url = `${baseUrl}/user/${userId}`;
  
  return generateQRCode(url);
}

export async function generateTransactionQR(transactionId: number): Promise<QRCodeResult> {
  const baseUrl = process.env.VITE_PUBLIC_URL || 'https://your-platform.com';
  const url = `${baseUrl}/transaction/${transactionId}`;
  
  return generateQRCode(url);
}

export async function generatePaymentQR(
  companyId: number,
  amount?: number,
  currency = 'USD'
): Promise<QRCodeResult> {
  const baseUrl = process.env.VITE_PUBLIC_URL || 'https://your-platform.com';
  const url = amount
    ? `${baseUrl}/pay/${companyId}?amount=${amount}&currency=${currency}`
    : `${baseUrl}/pay/${companyId}`;
  
  return generateQRCode(url, {
    color: {
      dark: '#10B981', // Green for payments
      light: '#FFFFFF'
    }
  });
}
