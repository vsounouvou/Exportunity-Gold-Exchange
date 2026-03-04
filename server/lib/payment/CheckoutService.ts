/**
 * Checkout Service
 * 
 * Handles creation and management of checkout sessions
 * Provides the interface for creating payment pages and processing payments
 */

import { nanoid } from 'nanoid';
import { db } from '@db';
import { eq } from 'drizzle-orm';
import { checkoutSessions } from '@db/schema';
import { PaymentOrchestrator } from './PaymentOrchestrator';

interface CreateCheckoutSessionParams {
  companyId: number;
  amount: number;
  currency?: string;
  description?: string;
  customerEmail?: string;
  customerPhone?: string;
  customerName?: string;
  successUrl?: string;
  cancelUrl?: string;
  expiresAt?: Date;
  metadata?: Record<string, any>;
}

export class CheckoutService {
  /**
   * Create a new checkout session
   */
  static async createSession(params: CreateCheckoutSessionParams) {
    const {
      companyId,
      amount,
      currency = 'XOF',
      description,
      customerEmail,
      customerPhone,
      customerName,
      successUrl,
      cancelUrl,
      expiresAt,
      metadata
    } = params;
    
    // Generate unique session ID
    const sessionId = `cs_${nanoid(24)}`;
    
    // Default expiration: 24 hours from now
    const defaultExpiresAt = new Date();
    defaultExpiresAt.setHours(defaultExpiresAt.getHours() + 24);
    
    try {
      // Create checkout session in database
      const [session] = await db.insert(checkoutSessions).values({
        sessionId,
        companyId,
        amount: amount.toString(),
        currency,
        description,
        customerEmail,
        customerPhone,
        customerName,
        successUrl,
        cancelUrl,
        expiresAt: expiresAt || defaultExpiresAt,
        status: 'pending',
        metadata: metadata || {},
      }).returning();
      
      // Create payment intent with orchestrator
      const paymentIntent = await PaymentOrchestrator.createPaymentIntent({
        companyId,
        amount,
        currency,
        description,
        checkoutSessionId: session.id,
        customerEmail,
        customerPhone,
        customerName,
        redirectUrl: `${process.env.REPLIT_DEV_DOMAIN || 'http://localhost:5000'}/checkout/${sessionId}/callback`,
        metadata: {
          ...metadata,
          sessionId,
        },
      });
      
      // Update session with payment intent ID
      await db.update(checkoutSessions)
        .set({
          status: 'processing',
          updatedAt: new Date(),
        })
        .where(eq(checkoutSessions.id, session.id));
      
      return {
        sessionId: session.sessionId,
        paymentUrl: paymentIntent.paymentUrl,
        checkoutUrl: `${process.env.REPLIT_DEV_DOMAIN || 'http://localhost:5000'}/checkout/${sessionId}`,
        expiresAt: session.expiresAt,
      };
      
    } catch (error: any) {
      console.error('[CheckoutService] Error creating session:', error);
      throw new Error(`Failed to create checkout session: ${error.message}`);
    }
  }
  
  /**
   * Get checkout session details
   */
  static async getSession(sessionId: string) {
    try {
      const [session] = await db.select()
        .from(checkoutSessions)
        .where(eq(checkoutSessions.sessionId, sessionId))
        .limit(1);
      
      if (!session) {
        throw new Error('Checkout session not found');
      }
      
      // Check if expired
      if (session.expiresAt && new Date() > new Date(session.expiresAt)) {
        await db.update(checkoutSessions)
          .set({
            status: 'cancelled',
            updatedAt: new Date(),
          })
          .where(eq(checkoutSessions.id, session.id));
        
        return {
          ...session,
          status: 'cancelled',
          expired: true,
        };
      }
      
      return session;
      
    } catch (error: any) {
      console.error('[CheckoutService] Error getting session:', error);
      throw error;
    }
  }
  
  /**
   * Update checkout session status
   */
  static async updateSessionStatus(sessionId: string, status: string) {
    try {
      await db.update(checkoutSessions)
        .set({
          status: status as any,
          updatedAt: new Date(),
        })
        .where(eq(checkoutSessions.sessionId, sessionId));
      
    } catch (error: any) {
      console.error('[CheckoutService] Error updating session status:', error);
      throw error;
    }
  }
  
  /**
   * Cancel a checkout session
   */
  static async cancelSession(sessionId: string) {
    try {
      await db.update(checkoutSessions)
        .set({
          status: 'cancelled',
          updatedAt: new Date(),
        })
        .where(eq(checkoutSessions.sessionId, sessionId));
      
    } catch (error: any) {
      console.error('[CheckoutService] Error cancelling session:', error);
      throw error;
    }
  }
}
