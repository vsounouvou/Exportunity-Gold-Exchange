/**
 * Flutterwave Payment Provider
 * 
 * Implements the PaymentProvider interface for Flutterwave
 * Handles payment intents, webhooks, and payouts for African markets
 */

import crypto from 'crypto';
import {
  PaymentProvider,
  PaymentIntentRequest,
  PaymentIntentResponse,
  PaymentStatusResponse,
  PayoutRequest,
  PayoutResponse,
  WebhookEvent
} from '../PaymentProvider';

interface FlutterwaveConfig {
  publicKey: string;
  secretKey: string;
  webhookSecret: string;
  baseUrl?: string;
}

export class FlutterwaveProvider implements PaymentProvider {
  readonly name = 'flutterwave';
  private config: FlutterwaveConfig;
  private baseUrl: string;
  
  constructor(config: FlutterwaveConfig) {
    this.config = config;
    this.baseUrl = config.baseUrl || 'https://api.flutterwave.com/v3';
  }
  
  /**
   * Create a payment intent using Flutterwave Standard
   */
  async createPaymentIntent(request: PaymentIntentRequest): Promise<PaymentIntentResponse> {
    try {
      const txRef = `FLW-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      const payload = {
        tx_ref: txRef,
        amount: request.amount,
        currency: request.currency,
        redirect_url: request.redirectUrl || `${process.env.REPLIT_DEV_DOMAIN || 'http://localhost:5000'}/payment/callback`,
        customer: {
          email: request.customerEmail || 'customer@example.com',
          phonenumber: request.customerPhone,
          name: request.customerName || 'Customer',
        },
        customizations: {
          title: 'Payment',
          description: request.description || 'Payment for services',
        },
        meta: request.metadata,
      };
      
      const response = await fetch(`${this.baseUrl}/payments`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.secretKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Flutterwave API error');
      }
      
      const data = await response.json();
      
      if (data.status !== 'success') {
        throw new Error(data.message || 'Failed to create payment');
      }
      
      return {
        providerTransactionId: data.data.id.toString(),
        providerTransactionRef: txRef,
        paymentUrl: data.data.link,
        status: 'pending',
        rawResponse: data,
      };
      
    } catch (error: any) {
      console.error('[Flutterwave] Create payment intent error:', error);
      throw error;
    }
  }
  
  /**
   * Get payment status from Flutterwave
   */
  async getPaymentStatus(providerTransactionId: string): Promise<PaymentStatusResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/transactions/${providerTransactionId}/verify`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.config.secretKey}`,
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        throw new Error('Failed to verify payment');
      }
      
      const data = await response.json();
      
      if (data.status !== 'success') {
        throw new Error(data.message || 'Payment verification failed');
      }
      
      const transaction = data.data;
      
      // Map Flutterwave status to our status
      let status: PaymentStatusResponse['status'];
      switch (transaction.status.toLowerCase()) {
        case 'successful':
          status = 'succeeded';
          break;
        case 'failed':
          status = 'failed';
          break;
        case 'cancelled':
          status = 'cancelled';
          break;
        default:
          status = 'pending';
      }
      
      // Calculate fees
      const amount = parseFloat(transaction.amount);
      const fee = parseFloat(transaction.app_fee || 0);
      const merchantFee = parseFloat(transaction.merchant_fee || 0);
      const providerFee = fee + merchantFee;
      const platformFee = amount * 0.015; // 1.5% platform fee
      const netAmount = amount - providerFee - platformFee;
      
      return {
        status,
        amount: parseFloat(transaction.amount),
        currency: transaction.currency,
        paidAt: transaction.created_at ? new Date(transaction.created_at) : undefined,
        paymentMethod: transaction.payment_type,
        paymentDetails: {
          cardBrand: transaction.card?.type,
          cardLast4: transaction.card?.last_4digits,
        },
        fees: {
          platformFee,
          providerFee,
          netAmount,
        },
        rawResponse: data,
      };
      
    } catch (error: any) {
      console.error('[Flutterwave] Get payment status error:', error);
      throw error;
    }
  }
  
  /**
   * Validate webhook signature and parse event
   */
  async validateWebhook(payload: any, signature: string): Promise<WebhookEvent> {
    try {
      // Verify webhook signature
      const hash = crypto
        .createHmac('sha256', this.config.webhookSecret)
        .update(JSON.stringify(payload))
        .digest('hex');
      
      if (hash !== signature) {
        throw new Error('Invalid webhook signature');
      }
      
      // Parse webhook event
      const event = payload.event;
      const txData = payload.data;
      
      // Map Flutterwave event to our event type
      let status: string;
      switch (txData.status?.toLowerCase()) {
        case 'successful':
          status = 'succeeded';
          break;
        case 'failed':
          status = 'failed';
          break;
        case 'cancelled':
          status = 'cancelled';
          break;
        default:
          status = 'processing';
      }
      
      return {
        eventType: event,
        providerEventId: payload.id?.toString(),
        transactionId: txData.id?.toString(),
        status,
        amount: parseFloat(txData.amount),
        currency: txData.currency,
        metadata: txData.meta,
        rawPayload: payload,
      };
      
    } catch (error: any) {
      console.error('[Flutterwave] Webhook validation error:', error);
      throw error;
    }
  }
  
  /**
   * Create a payout using Flutterwave Transfer
   */
  async createPayout(request: PayoutRequest): Promise<PayoutResponse> {
    try {
      const reference = `PAYOUT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      let payload: any = {
        account_bank: request.destinationDetails.bankCode,
        account_number: request.destinationDetails.accountNumber,
        amount: request.amount,
        currency: request.currency,
        narration: request.narration || 'Payout',
        reference,
        callback_url: `${process.env.REPLIT_DEV_DOMAIN || 'http://localhost:5000'}/payment/payout-callback`,
        debit_currency: request.currency,
      };
      
      // Handle mobile money payouts differently
      if (request.destination === 'mobile_money') {
        payload = {
          ...payload,
          account_bank: request.destinationDetails.provider, // e.g., MTN, Vodafone
          account_number: request.destinationDetails.mobileNumber,
        };
      }
      
      const response = await fetch(`${this.baseUrl}/transfers`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.secretKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Flutterwave payout error');
      }
      
      const data = await response.json();
      
      if (data.status !== 'success') {
        throw new Error(data.message || 'Failed to create payout');
      }
      
      const transfer = data.data;
      
      // Map status
      let status: PayoutResponse['status'];
      switch (transfer.status?.toLowerCase()) {
        case 'successful':
          status = 'completed';
          break;
        case 'failed':
          status = 'failed';
          break;
        default:
          status = 'processing';
      }
      
      // Calculate fees (Flutterwave charges vary by destination)
      const fee = parseFloat(transfer.fee || request.amount * 0.02); // ~2% typical
      const netAmount = request.amount - fee;
      
      return {
        providerPayoutId: transfer.id.toString(),
        status,
        fee,
        netAmount,
        rawResponse: data,
      };
      
    } catch (error: any) {
      console.error('[Flutterwave] Create payout error:', error);
      throw error;
    }
  }
  
  /**
   * Get payout status from Flutterwave
   */
  async getPayoutStatus(providerPayoutId: string): Promise<PayoutResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/transfers/${providerPayoutId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.config.secretKey}`,
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        throw new Error('Failed to get payout status');
      }
      
      const data = await response.json();
      
      if (data.status !== 'success') {
        throw new Error(data.message || 'Payout status check failed');
      }
      
      const transfer = data.data;
      
      // Map status
      let status: PayoutResponse['status'];
      switch (transfer.status?.toLowerCase()) {
        case 'successful':
          status = 'completed';
          break;
        case 'failed':
          status = 'failed';
          break;
        default:
          status = 'processing';
      }
      
      const amount = parseFloat(transfer.amount);
      const fee = parseFloat(transfer.fee || amount * 0.02);
      const netAmount = amount - fee;
      
      return {
        providerPayoutId: transfer.id.toString(),
        status,
        fee,
        netAmount,
        rawResponse: data,
      };
      
    } catch (error: any) {
      console.error('[Flutterwave] Get payout status error:', error);
      throw error;
    }
  }
}

/**
 * Initialize and register Flutterwave provider
 */
export function initializeFlutterwaveProvider() {
  const config: FlutterwaveConfig = {
    publicKey: process.env.FLUTTERWAVE_PUBLIC_KEY || '',
    secretKey: process.env.FLUTTERWAVE_SECRET_KEY || '',
    webhookSecret: process.env.FLUTTERWAVE_WEBHOOK_SECRET || '',
  };
  
  // Only register if keys are provided
  if (config.secretKey) {
    const provider = new FlutterwaveProvider(config);
    const { PaymentProviderFactory } = require('../PaymentProvider');
    PaymentProviderFactory.registerProvider('flutterwave', provider);
    console.log('[Payment] Flutterwave provider registered');
  } else {
    console.warn('[Payment] Flutterwave provider not registered - missing API keys');
  }
}
