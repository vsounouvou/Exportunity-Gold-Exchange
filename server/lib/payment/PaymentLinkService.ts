import { db } from '@db';
import { paymentLinks, checkoutSessions, companies } from '@db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import QRCode from 'qrcode';

export interface CreatePaymentLinkInput {
  companyId: number;
  amount?: number; // Optional: if not set, customer enters amount
  currency?: string;
  description?: string;
  expiresAt?: Date;
  maxUses?: number;
  metadata?: Record<string, any>;
}

export interface PaymentLinkResponse {
  id: string;
  linkId: string;
  url: string;
  qrCodeUrl?: string;
  qrCodeDataUrl?: string;
  companyId: number;
  name?: string;
  amount?: string; // Decimal field returns string
  currency: string;
  description?: string;
  active: boolean;
  usedCount: number;
  maxUses?: number;
  expiresAt?: Date;
  createdAt: Date;
}

/**
 * Payment Link Service
 * 
 * Handles generation of payment links and QR codes for companies.
 * Links can be:
 * - Fixed amount (customer pays exact amount)
 * - Variable amount (customer enters amount at checkout)
 * - Single-use or multi-use
 * - Time-limited or permanent
 */
export class PaymentLinkService {
  
  /**
   * Generate base URL for payment links
   */
  private static getBaseUrl(): string {
    // In production, use actual domain
    return process.env.PUBLIC_URL || 'http://localhost:5000';
  }
  
  /**
   * Create a payment link
   */
  static async createPaymentLink(input: CreatePaymentLinkInput): Promise<PaymentLinkResponse> {
    try {
      // Validate company exists
      const [company] = await db.select()
        .from(companies)
        .where(eq(companies.id, input.companyId))
        .limit(1);
      
      if (!company) {
        throw new Error(`Company ${input.companyId} not found`);
      }
      
      // Generate unique link ID (8 characters for short URLs)
      const linkId = nanoid(8);
      
      // Create payment link
      const [link] = await db.insert(paymentLinks).values({
        linkId,
        companyId: input.companyId,
        amount: input.amount?.toString(),
        currency: input.currency || 'XOF',
        description: input.description,
        active: true,
        usedCount: 0,
        maxUses: input.maxUses,
        expiresAt: input.expiresAt,
        metadata: input.metadata || {},
      }).returning();
      
      // Generate URLs
      const baseUrl = this.getBaseUrl();
      const paymentUrl = `${baseUrl}/pay/${linkId}`;
      
      // Generate QR code as data URL
      const qrCodeDataUrl = await QRCode.toDataURL(paymentUrl, {
        width: 400,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });
      
      return {
        id: link.id.toString(),
        linkId: link.linkId,
        url: paymentUrl,
        qrCodeDataUrl,
        companyId: link.companyId,
        name: link.name || undefined,
        amount: link.amount || undefined,
        currency: link.currency,
        description: link.description || undefined,
        active: link.active || false,
        usedCount: link.usedCount || 0,
        maxUses: link.maxUses || undefined,
        expiresAt: link.expiresAt || undefined,
        createdAt: link.createdAt || new Date(),
      };
      
    } catch (error: any) {
      console.error('[PaymentLinkService] Error creating payment link:', error);
      throw new Error(`Failed to create payment link: ${error.message}`);
    }
  }
  
  /**
   * Get payment link by link ID
   */
  static async getPaymentLinkByCode(linkId: string): Promise<PaymentLinkResponse | null> {
    try {
      const [link] = await db.select()
        .from(paymentLinks)
        .where(eq(paymentLinks.linkId, linkId))
        .limit(1);
      
      if (!link) {
        return null;
      }
      
      // Check if link is still valid
      if (!link.active) {
        throw new Error('Payment link is no longer active');
      }
      
      if (link.expiresAt && new Date(link.expiresAt) < new Date()) {
        // Auto-expire the link
        await db.update(paymentLinks)
          .set({ active: false })
          .where(eq(paymentLinks.id, link.id));
        throw new Error('Payment link has expired');
      }
      
      if (link.maxUses && (link.usedCount || 0) >= link.maxUses) {
        // Auto-disable if max uses reached
        await db.update(paymentLinks)
          .set({ active: false })
          .where(eq(paymentLinks.id, link.id));
        throw new Error('Payment link has reached maximum usage');
      }
      
      const baseUrl = this.getBaseUrl();
      const paymentUrl = `${baseUrl}/pay/${linkId}`;
      
      return {
        id: link.id.toString(),
        linkId: link.linkId,
        url: paymentUrl,
        companyId: link.companyId,
        name: link.name || undefined,
        amount: link.amount || undefined,
        currency: link.currency,
        description: link.description || undefined,
        active: link.active || false,
        usedCount: link.usedCount || 0,
        maxUses: link.maxUses || undefined,
        expiresAt: link.expiresAt || undefined,
        createdAt: link.createdAt || new Date(),
      };
      
    } catch (error: any) {
      console.error('[PaymentLinkService] Error getting payment link:', error);
      throw error;
    }
  }
  
  /**
   * Create checkout session from payment link
   */
  static async createSessionFromLink(
    linkId: string,
    customerAmount?: number,
    customerEmail?: string,
    customerPhone?: string
  ): Promise<any> {
    try {
      const link = await this.getPaymentLinkByCode(linkId);
      
      if (!link) {
        throw new Error('Payment link not found');
      }
      
      // Determine amount
      let finalAmount: number;
      if (link.amount) {
        // Fixed amount link
        const linkAmount = parseFloat(link.amount);
        finalAmount = linkAmount;
        if (customerAmount && customerAmount !== linkAmount) {
          throw new Error('Amount mismatch: this link requires a fixed amount');
        }
      } else {
        // Variable amount link
        if (!customerAmount || customerAmount <= 0) {
          throw new Error('Amount is required for this payment link');
        }
        finalAmount = customerAmount;
      }
      
      // Import CheckoutService dynamically to avoid circular dependencies
      const { CheckoutService } = await import('./CheckoutService');
      
      // Create checkout session
      const session = await CheckoutService.createSession({
        companyId: link.companyId,
        amount: finalAmount,
        currency: link.currency,
        description: link.description || 'Payment via link',
        customerEmail,
        customerPhone,
        metadata: {
          paymentLinkId: link.id,
          paymentLinkCode: linkId,
        },
      });
      
      // Increment usage count
      await db.update(paymentLinks)
        .set({ 
          usedCount: link.usedCount + 1,
          updatedAt: new Date()
        })
        .where(eq(paymentLinks.id, parseInt(link.id)));
      
      return session;
      
    } catch (error: any) {
      console.error('[PaymentLinkService] Error creating session from link:', error);
      throw error;
    }
  }
  
  /**
   * Get all payment links for a company
   */
  static async getCompanyPaymentLinks(companyId: number): Promise<PaymentLinkResponse[]> {
    try {
      const links = await db.select()
        .from(paymentLinks)
        .where(eq(paymentLinks.companyId, companyId))
        .orderBy(desc(paymentLinks.createdAt));
      
      const baseUrl = this.getBaseUrl();
      
      return links.map(link => ({
        id: link.id.toString(),
        linkId: link.linkId,
        url: `${baseUrl}/pay/${link.linkId}`,
        companyId: link.companyId,
        name: link.name || undefined,
        amount: link.amount || undefined,
        currency: link.currency,
        description: link.description || undefined,
        active: link.active || false,
        usedCount: link.usedCount || 0,
        maxUses: link.maxUses || undefined,
        expiresAt: link.expiresAt || undefined,
        createdAt: link.createdAt || new Date(),
      }));
      
    } catch (error: any) {
      console.error('[PaymentLinkService] Error getting company payment links:', error);
      throw error;
    }
  }
  
  /**
   * Update payment link active status
   */
  static async updateLinkStatus(linkId: string, active: boolean): Promise<void> {
    try {
      await db.update(paymentLinks)
        .set({ active })
        .where(eq(paymentLinks.linkId, linkId));
      
    } catch (error: any) {
      console.error('[PaymentLinkService] Error updating link status:', error);
      throw error;
    }
  }
  
  /**
   * Delete payment link
   */
  static async deletePaymentLink(linkId: string): Promise<void> {
    try {
      await db.delete(paymentLinks)
        .where(eq(paymentLinks.linkId, linkId));
      
    } catch (error: any) {
      console.error('[PaymentLinkService] Error deleting payment link:', error);
      throw error;
    }
  }
  
  /**
   * Generate QR code for existing payment link
   */
  static async generateQRCode(linkId: string): Promise<string> {
    try {
      const baseUrl = this.getBaseUrl();
      const paymentUrl = `${baseUrl}/pay/${linkId}`;
      
      const qrCodeDataUrl = await QRCode.toDataURL(paymentUrl, {
        width: 400,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });
      
      return qrCodeDataUrl;
      
    } catch (error: any) {
      console.error('[PaymentLinkService] Error generating QR code:', error);
      throw error;
    }
  }
}
