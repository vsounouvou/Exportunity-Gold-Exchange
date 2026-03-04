/**
 * Payment Orchestrator Service
 * 
 * Central service that coordinates all payment operations
 * Acts as the single interface between the platform and payment providers
 */

import { nanoid } from 'nanoid';
import { db } from '@db';
import { eq, and } from 'drizzle-orm';
import { 
  paymentIntents, 
  checkoutSessions,
  merchantAccounts,
  payouts,
  transactionLedger
} from '@db/schema';
import { 
  PaymentProvider, 
  PaymentProviderFactory, 
  PaymentIntentRequest,
  PayoutRequest 
} from './PaymentProvider';

interface CreatePaymentIntentParams {
  companyId: number;
  amount: number;
  currency?: string;
  description?: string;
  checkoutSessionId?: number;
  customerEmail?: string;
  customerPhone?: string;
  customerName?: string;
  redirectUrl?: string;
  metadata?: Record<string, any>;
  provider?: string; // Optional: specify provider, otherwise auto-select
}

interface CreatePayoutParams {
  companyId: number;
  amount: number;
  currency?: string;
  destination: 'bank_account' | 'mobile_money';
  destinationDetails: {
    accountNumber?: string;
    bankCode?: string;
    bankName?: string;
    mobileNumber?: string;
    provider?: string;
  };
  narration?: string;
  metadata?: Record<string, any>;
  provider?: string;
}

export class PaymentOrchestrator {
  /**
   * Select the best payment provider based on criteria
   */
  private static selectProvider(currency: string, country?: string): PaymentProvider {
    // For now, default to Flutterwave for African currencies
    const africanCurrencies = ['XOF', 'XAF', 'NGN', 'KES', 'GHS', 'UGX', 'TZS', 'RWF'];
    
    if (africanCurrencies.includes(currency.toUpperCase())) {
      return PaymentProviderFactory.getProvider('flutterwave');
    }
    
    // Default to Flutterwave for all cases
    return PaymentProviderFactory.getProvider('flutterwave');
  }
  
  /**
   * Create a payment intent
   */
  static async createPaymentIntent(params: CreatePaymentIntentParams) {
    const {
      companyId,
      amount,
      currency = 'XOF',
      description,
      checkoutSessionId,
      customerEmail,
      customerPhone,
      customerName,
      redirectUrl,
      metadata,
      provider: providerName
    } = params;
    
    // Select provider
    const provider = providerName 
      ? PaymentProviderFactory.getProvider(providerName)
      : this.selectProvider(currency);
    
    // Generate unique intent ID
    const intentId = `pi_${nanoid(24)}`;
    
    try {
      // Create payment intent with provider
      const providerResponse = await provider.createPaymentIntent({
        amount,
        currency,
        description,
        customerEmail,
        customerPhone,
        customerName,
        redirectUrl,
        metadata: {
          ...metadata,
          intentId,
          companyId: companyId.toString(),
        }
      });
      
      // Calculate fees (placeholder logic - should be based on provider)
      const platformFeePercent = 0.015; // 1.5%
      const providerFeePercent = 0.025; // 2.5%
      const platformFee = parseFloat((amount * platformFeePercent).toFixed(2));
      const providerFee = parseFloat((amount * providerFeePercent).toFixed(2));
      const netAmount = parseFloat((amount - platformFee - providerFee).toFixed(2));
      
      // Save payment intent to database
      const [intent] = await db.insert(paymentIntents).values({
        intentId,
        companyId,
        checkoutSessionId,
        amount: amount.toString(),
        currency,
        description,
        provider: provider.name.toLowerCase() as any,
        providerTransactionId: providerResponse.providerTransactionId,
        providerTransactionRef: providerResponse.providerTransactionRef,
        paymentUrl: providerResponse.paymentUrl,
        status: providerResponse.status,
        platformFee: platformFee.toString(),
        providerFee: providerFee.toString(),
        netAmount: netAmount.toString(),
      }).returning();
      
      // Update checkout session if linked
      if (checkoutSessionId) {
        await db.update(checkoutSessions)
          .set({ paymentIntentId: intent.id })
          .where(eq(checkoutSessions.id, checkoutSessionId));
      }
      
      // Create ledger entry
      await this.createLedgerEntry({
        companyId,
        type: 'payment',
        amount,
        currency,
        paymentIntentId: intent.id,
        checkoutSessionId,
        status: providerResponse.status,
        provider: provider.name.toLowerCase() as any,
        providerReference: providerResponse.providerTransactionRef,
        payerEmail: customerEmail,
        payerPhone: customerPhone,
        payerName: customerName,
        description: description || 'Payment initiated',
        metadata,
      });
      
      return {
        intentId: intent.intentId,
        paymentUrl: intent.paymentUrl,
        status: intent.status,
        provider: provider.name,
      };
      
    } catch (error: any) {
      console.error('[PaymentOrchestrator] Error creating payment intent:', error);
      
      // Create failed payment intent record
      const [failedIntent] = await db.insert(paymentIntents).values({
        intentId,
        companyId,
        checkoutSessionId,
        amount: amount.toString(),
        currency,
        description,
        provider: provider.name.toLowerCase() as any,
        status: 'failed',
        failureReason: error.message,
      }).returning();
      
      throw new Error(`Failed to create payment intent: ${error.message}`);
    }
  }
  
  /**
   * Handle webhook from payment provider
   */
  static async handleWebhook(provider: string, payload: any, signature: string) {
    try {
      const paymentProvider = PaymentProviderFactory.getProvider(provider);
      
      // Validate and parse webhook
      const webhookEvent = await paymentProvider.validateWebhook(payload, signature);
      
      // CRITICAL: Check for duplicate webhook events (idempotency)
      const idempotencyKey = webhookEvent.providerEventId 
        ? `${provider}_${webhookEvent.providerEventId}`
        : `${provider}_${webhookEvent.transactionId}_${webhookEvent.status}`;
      
      const { webhookEvents } = await import('@db/schema');
      const [existingEvent] = await db.select()
        .from(webhookEvents)
        .where(eq(webhookEvents.idempotencyKey, idempotencyKey))
        .limit(1);
      
      if (existingEvent?.processed) {
        console.warn(`[PaymentOrchestrator] Duplicate webhook event ${idempotencyKey} - already processed`);
        return { processed: true, duplicate: true, reason: 'Already processed' };
      }
      
      // Log webhook event for audit trail and idempotency
      if (!existingEvent) {
        await db.insert(webhookEvents).values({
          provider: provider as any,
          eventType: webhookEvent.eventType,
          providerEventId: webhookEvent.providerEventId,
          payload,
          signature,
          processed: false,
          idempotencyKey,
        });
      }
      
      // Find the payment intent
      const [intent] = await db.select()
        .from(paymentIntents)
        .where(eq(paymentIntents.providerTransactionId, webhookEvent.transactionId || ''))
        .limit(1);
      
      if (!intent) {
        console.warn(`[PaymentOrchestrator] Payment intent not found for transaction ${webhookEvent.transactionId}`);
        // Mark webhook as processed to prevent retries
        await db.update(webhookEvents)
          .set({ processed: true, processingError: 'Intent not found' })
          .where(eq(webhookEvents.idempotencyKey, idempotencyKey));
        return { processed: false, reason: 'Intent not found' };
      }
      
      // Update payment intent status
      const updateData: any = {
        status: webhookEvent.status,
        updatedAt: new Date(),
      };
      
      if (webhookEvent.status === 'succeeded') {
        updateData.paidAt = new Date();
        
        // Get full payment status to extract fees and payment details
        const paymentStatus = await paymentProvider.getPaymentStatus(intent.providerTransactionId!);
        
        if (paymentStatus.fees) {
          updateData.platformFee = paymentStatus.fees.platformFee.toString();
          updateData.providerFee = paymentStatus.fees.providerFee.toString();
          updateData.netAmount = paymentStatus.fees.netAmount.toString();
        }
        
        if (paymentStatus.paymentMethod) {
          updateData.paymentMethod = paymentStatus.paymentMethod;
          updateData.paymentDetails = paymentStatus.paymentDetails || {};
        }
        
        // Update merchant account balance
        await this.creditMerchantAccount(
          intent.companyId,
          parseFloat(intent.amount),
          intent.currency
        );
        
        // Update ledger
        await this.createLedgerEntry({
          companyId: intent.companyId,
          type: 'payment',
          amount: parseFloat(intent.amount),
          currency: intent.currency,
          paymentIntentId: intent.id,
          checkoutSessionId: intent.checkoutSessionId || undefined,
          status: 'succeeded',
          provider: provider as any,
          providerReference: intent.providerTransactionRef || '',
          description: 'Payment completed successfully',
        });
      }
      
      await db.update(paymentIntents)
        .set(updateData)
        .where(eq(paymentIntents.id, intent.id));
      
      // Update checkout session if linked
      if (intent.checkoutSessionId) {
        await db.update(checkoutSessions)
          .set({ status: webhookEvent.status as any })
          .where(eq(checkoutSessions.id, intent.checkoutSessionId));
      }
      
      return { processed: true, intentId: intent.intentId };
      
    } catch (error: any) {
      console.error('[PaymentOrchestrator] Webhook processing error:', error);
      throw error;
    }
  }
  
  /**
   * Create a payout
   */
  static async createPayout(params: CreatePayoutParams) {
    const {
      companyId,
      amount,
      currency = 'XOF',
      destination,
      destinationDetails,
      narration,
      metadata,
      provider: providerName
    } = params;
    
    // Check merchant account balance
    const [merchantAccount] = await db.select()
      .from(merchantAccounts)
      .where(eq(merchantAccounts.companyId, companyId))
      .limit(1);
    
    if (!merchantAccount) {
      throw new Error('Merchant account not found');
    }
    
    if (parseFloat(merchantAccount.availableBalance) < amount) {
      throw new Error('Insufficient balance');
    }
    
    // Select provider
    const provider = providerName 
      ? PaymentProviderFactory.getProvider(providerName)
      : this.selectProvider(currency);
    
    // Generate unique payout ID
    const payoutId = `po_${nanoid(24)}`;
    
    try {
      // Create payout with provider
      const providerResponse = await provider.createPayout({
        amount,
        currency,
        destination,
        destinationDetails,
        narration,
        metadata: {
          ...metadata,
          payoutId,
          companyId: companyId.toString(),
        }
      });
      
      // Save payout to database
      const [payout] = await db.insert(payouts).values({
        payoutId,
        companyId,
        merchantAccountId: merchantAccount.id,
        amount: amount.toString(),
        currency,
        destination,
        destinationDetails,
        provider: provider.name.toLowerCase() as any,
        providerPayoutId: providerResponse.providerPayoutId,
        status: providerResponse.status,
        fee: providerResponse.fee.toString(),
        netAmount: providerResponse.netAmount.toString(),
      }).returning();
      
      // Deduct from merchant account
      await this.debitMerchantAccount(companyId, amount, currency);
      
      // Create ledger entry
      await this.createLedgerEntry({
        companyId,
        type: 'payout',
        amount,
        currency,
        payoutId: payout.id,
        status: providerResponse.status,
        provider: provider.name.toLowerCase() as any,
        providerReference: providerResponse.providerPayoutId,
        description: narration || 'Payout initiated',
        metadata,
      });
      
      return {
        payoutId: payout.payoutId,
        status: payout.status,
        fee: payout.fee,
        netAmount: payout.netAmount,
      };
      
    } catch (error: any) {
      console.error('[PaymentOrchestrator] Error creating payout:', error);
      throw new Error(`Failed to create payout: ${error.message}`);
    }
  }
  
  /**
   * Credit merchant account (when payment succeeds)
   */
  private static async creditMerchantAccount(companyId: number, amount: number, currency: string) {
    const [account] = await db.select()
      .from(merchantAccounts)
      .where(eq(merchantAccounts.companyId, companyId))
      .limit(1);
    
    if (!account) {
      // Create merchant account if it doesn't exist
      await db.insert(merchantAccounts).values({
        companyId,
        availableBalance: amount.toString(),
        currency,
        totalReceived: amount.toString(),
      });
    } else {
      // Update existing account
      const newBalance = parseFloat(account.availableBalance) + amount;
      const newTotalReceived = parseFloat(account.totalReceived || '0') + amount;
      
      await db.update(merchantAccounts)
        .set({
          availableBalance: newBalance.toString(),
          totalReceived: newTotalReceived.toString(),
          updatedAt: new Date(),
        })
        .where(eq(merchantAccounts.id, account.id));
    }
  }
  
  /**
   * Debit merchant account (when payout is created)
   */
  private static async debitMerchantAccount(companyId: number, amount: number, currency: string) {
    const [account] = await db.select()
      .from(merchantAccounts)
      .where(eq(merchantAccounts.companyId, companyId))
      .limit(1);
    
    if (!account) {
      throw new Error('Merchant account not found');
    }
    
    const newBalance = parseFloat(account.availableBalance) - amount;
    const newTotalPaidOut = parseFloat(account.totalPaidOut || '0') + amount;
    
    await db.update(merchantAccounts)
      .set({
        availableBalance: newBalance.toString(),
        totalPaidOut: newTotalPaidOut.toString(),
        updatedAt: new Date(),
      })
      .where(eq(merchantAccounts.id, account.id));
  }
  
  /**
   * Create transaction ledger entry
   */
  private static async createLedgerEntry(params: {
    companyId: number;
    type: 'payment' | 'refund' | 'payout' | 'fee' | 'adjustment' | 'gold_conversion';
    amount: number;
    currency: string;
    paymentIntentId?: number;
    checkoutSessionId?: number;
    payoutId?: number;
    status: string;
    provider?: string;
    providerReference?: string;
    payerEmail?: string;
    payerPhone?: string;
    payerName?: string;
    description?: string;
    metadata?: Record<string, any>;
  }) {
    const transactionId = `txn_${nanoid(24)}`;
    
    await db.insert(transactionLedger).values({
      transactionId,
      companyId: params.companyId,
      type: params.type,
      amount: params.amount.toString(),
      currency: params.currency,
      paymentIntentId: params.paymentIntentId,
      checkoutSessionId: params.checkoutSessionId,
      payoutId: params.payoutId,
      payerEmail: params.payerEmail,
      payerPhone: params.payerPhone,
      payerName: params.payerName,
      provider: params.provider as any,
      providerReference: params.providerReference,
      status: params.status as any,
      description: params.description,
      metadata: params.metadata || {},
    });
  }
}
