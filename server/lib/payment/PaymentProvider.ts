/**
 * Payment Provider Interface
 * 
 * All payment providers (Flutterwave, Paystack, Stripe, etc.) must implement this interface
 * This ensures the Payment Orchestrator can work with any provider interchangeably
 */

export interface PaymentIntentRequest {
  amount: number;
  currency: string;
  description?: string;
  customerEmail?: string;
  customerPhone?: string;
  customerName?: string;
  redirectUrl?: string;
  metadata?: Record<string, any>;
}

export interface PaymentIntentResponse {
  providerTransactionId: string;
  providerTransactionRef: string;
  paymentUrl: string;
  status: 'pending' | 'processing' | 'succeeded' | 'failed';
  paymentMethod?: string;
  rawResponse: any;
}

export interface PaymentStatusResponse {
  status: 'pending' | 'processing' | 'succeeded' | 'failed' | 'cancelled' | 'refunded';
  amount: number;
  currency: string;
  paidAt?: Date;
  paymentMethod?: string;
  paymentDetails?: {
    cardBrand?: string;
    cardLast4?: string;
    mobileMoneyProvider?: string;
    bankName?: string;
  };
  fees?: {
    platformFee: number;
    providerFee: number;
    netAmount: number;
  };
  rawResponse: any;
}

export interface PayoutRequest {
  amount: number;
  currency: string;
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
}

export interface PayoutResponse {
  providerPayoutId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  fee: number;
  netAmount: number;
  rawResponse: any;
}

export interface WebhookEvent {
  eventType: string;
  providerEventId?: string;
  transactionId?: string;
  status: string;
  amount?: number;
  currency?: string;
  metadata?: Record<string, any>;
  rawPayload: any;
}

/**
 * Abstract Payment Provider Interface
 * All payment providers must implement these methods
 */
export interface PaymentProvider {
  readonly name: string;
  
  /**
   * Create a payment intent/session with the provider
   */
  createPaymentIntent(request: PaymentIntentRequest): Promise<PaymentIntentResponse>;
  
  /**
   * Get the current status of a payment transaction
   */
  getPaymentStatus(providerTransactionId: string): Promise<PaymentStatusResponse>;
  
  /**
   * Validate and parse webhook events from the provider
   */
  validateWebhook(payload: any, signature: string): Promise<WebhookEvent>;
  
  /**
   * Create a payout/transfer to a bank account or mobile money
   */
  createPayout(request: PayoutRequest): Promise<PayoutResponse>;
  
  /**
   * Get the status of a payout
   */
  getPayoutStatus(providerPayoutId: string): Promise<PayoutResponse>;
}

/**
 * Payment Provider Factory
 * Returns the appropriate provider implementation
 */
export class PaymentProviderFactory {
  private static providers = new Map<string, PaymentProvider>();
  
  static registerProvider(name: string, provider: PaymentProvider) {
    this.providers.set(name.toLowerCase(), provider);
  }
  
  static getProvider(name: string): PaymentProvider {
    const provider = this.providers.get(name.toLowerCase());
    if (!provider) {
      throw new Error(`Payment provider '${name}' not registered`);
    }
    return provider;
  }
  
  static getSupportedProviders(): string[] {
    return Array.from(this.providers.keys());
  }
}
