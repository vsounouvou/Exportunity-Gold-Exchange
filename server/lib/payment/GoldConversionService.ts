import { db } from '@db';
import { goldAllocations } from '@db/schema';
import { eq } from 'drizzle-orm';
import { getFxSnapshot, getUsdConversionRateForCurrency } from "../fx";

export interface ConvertToGoldRequest {
  customerEmail?: string;
  customerPhone?: string;
  customerName?: string;
  companyId: number; // Company making the conversion
  fiatAmount: number; // Amount in fiat currency to convert
  currency: string; // Currency code (e.g. 'XOF', 'USD')
  paymentReference?: string; // Reference to original payment
  metadata?: Record<string, any>;
}

export interface GoldConversionResult {
  allocationId: string;
  grams: number;
  pricePerGramUsd: number;
  totalFiatAmount: number;
  currency: string;
  status: string;
  createdAt: Date;
}

/**
 * Gold Conversion Service
 * 
 * Handles optional post-payment gold conversion.
 * Allows customers to convert their fiat balance into gold allocation.
 * 
 * This is a SIMPLE service that:
 * 1. Looks up current gold price
 * 2. Converts fiat amount to gold grams
 * 3. Deducts from company/customer balance
 * 4. Creates gold allocation record
 * 
 * The actual gold sourcing, hedging, custody, and delivery is handled
 * by separate gold-trade agents and is NOT part of this payment gateway.
 */
export class GoldConversionService {
  private static readonly DEFAULT_FX_SCOPE = "tenant:default";
  
  /**
   * Get current gold price per gram in USD
   * 
   * In production, this would call:
   * - Gold price API (e.g. GoldAPI.io, LBMA)
   * - Internal pricing service
   * - Market data feed
   * 
   * For MVP, using approximate market price
   */
  private static async getCurrentGoldPriceUSD(): Promise<number> {
    // TODO: Integrate with real gold price API
    // Example APIs:
    // - https://www.goldapi.io/
    // - https://metals-api.com/
    // - LBMA (London Bullion Market Association) feed
    
    // Approximate spot price: ~$60-70 USD per gram for 24K gold
    // For MVP, return a fixed price + small markup
    const spotPricePerGram = 65.00; // USD per gram
    const markup = 1.02; // 2% markup for service fee
    
    return spotPricePerGram * markup;
  }
  
  /**
   * Convert currency to USD
   */
  private static async convertToUSD(amount: number, currency: string): Promise<number> {
    const normalizedCurrency = String(currency || "USD").trim().toUpperCase();
    if (normalizedCurrency === 'USD') {
      return amount;
    }

    const fx = await getFxSnapshot(this.DEFAULT_FX_SCOPE);
    const perUsdRate = getUsdConversionRateForCurrency(fx.effectiveRates, normalizedCurrency);
    return amount / perUsdRate;
  }
  
  /**
   * Convert fiat currency to gold
   * 
   * This is the main endpoint for post-payment gold conversion.
   * Called when a customer chooses "Convert to Gold" option.
   */
  static async convertToGold(request: ConvertToGoldRequest): Promise<GoldConversionResult> {
    try {
      const { customerEmail, customerPhone, customerName, companyId, fiatAmount, currency, paymentReference, metadata } = request;
      
      // Validate input
      if (fiatAmount <= 0) {
        throw new Error('Amount must be greater than zero');
      }
      
      // Get current gold price (USD per gram)
      const goldPricePerGram = await this.getCurrentGoldPriceUSD();
      
      // Convert fiat amount to USD
      const amountUSD = await this.convertToUSD(fiatAmount, currency);
      
      // Calculate grams of gold
      const grams = amountUSD / goldPricePerGram;
      
      // Round to 3 decimal places (milligrams precision)
      const gramsRounded = Math.round(grams * 1000) / 1000;
      
      if (gramsRounded < 0.001) {
        throw new Error('Amount too small: minimum 0.001 grams (1 milligram) of gold');
      }
      
      // Create gold allocation record
      const [allocation] = await db.insert(goldAllocations).values({
        allocationId: `gold_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        companyId,
        customerEmail: customerEmail || null,
        customerPhone: customerPhone || null,
        customerName: customerName || null,
        fiatAmount: fiatAmount.toFixed(2),
        fiatCurrency: currency,
        gramsAllocated: gramsRounded.toFixed(4),
        goldPricePerGram: goldPricePerGram.toFixed(2),
        goldPriceCurrency: "USD",
        status: 'IN_CUSTODY', // Gold is allocated but not yet delivered
        metadata: {
          ...metadata,
          paymentReference,
          conversionDate: new Date().toISOString(),
          exchangeRate: await this.convertToUSD(1, currency),
          goldPriceAtConversion: goldPricePerGram,
        },
      }).returning();
      
      console.log(`[GoldConversion] Allocated ${gramsRounded}g gold for ${currency} ${fiatAmount} (company ${companyId})`);
      
      return {
        allocationId: allocation.allocationId,
        grams: gramsRounded,
        pricePerGramUsd: goldPricePerGram,
        totalFiatAmount: fiatAmount,
        currency,
        status: allocation.status,
        createdAt: allocation.createdAt || new Date(),
      };
      
    } catch (error: any) {
      console.error('[GoldConversionService] Error converting to gold:', error);
      throw new Error(`Gold conversion failed: ${error.message}`);
    }
  }
  
  /**
   * Get gold allocation details
   */
  static async getGoldAllocation(allocationId: string): Promise<any> {
    try {
      const [allocation] = await db.select()
        .from(goldAllocations)
        .where(eq(goldAllocations.allocationId, allocationId))
        .limit(1);
      
      if (!allocation) {
        throw new Error('Gold allocation not found');
      }
      
      return {
        allocationId: allocation.allocationId,
        companyId: allocation.companyId,
        customerEmail: allocation.customerEmail,
        customerPhone: allocation.customerPhone,
        customerName: allocation.customerName,
        grams: parseFloat(allocation.gramsAllocated),
        pricePerGramUsd: parseFloat(allocation.goldPricePerGram),
        totalFiatAmount: parseFloat(allocation.fiatAmount),
        currency: allocation.fiatCurrency,
        status: allocation.status,
        metadata: allocation.metadata,
        createdAt: allocation.createdAt,
        updatedAt: allocation.updatedAt,
      };
      
    } catch (error: any) {
      console.error('[GoldConversionService] Error getting allocation:', error);
      throw error;
    }
  }
  
  /**
   * Get all gold allocations for a company
   */
  static async getCompanyGoldAllocations(companyId: number): Promise<any[]> {
    try {
      const allocations = await db.select()
        .from(goldAllocations)
        .where(eq(goldAllocations.companyId, companyId));
      
      return allocations.map(allocation => ({
        allocationId: allocation.allocationId,
        customerEmail: allocation.customerEmail,
        customerPhone: allocation.customerPhone,
        customerName: allocation.customerName,
        grams: parseFloat(allocation.gramsAllocated),
        pricePerGramUsd: parseFloat(allocation.goldPricePerGram),
        totalFiatAmount: parseFloat(allocation.fiatAmount),
        currency: allocation.fiatCurrency,
        status: allocation.status,
        createdAt: allocation.createdAt,
      }));
      
    } catch (error: any) {
      console.error('[GoldConversionService] Error getting company allocations:', error);
      throw error;
    }
  }
  
  /**
   * Update gold allocation status
   * (e.g. when gold is delivered, transferred, sold back)
   */
  static async updateAllocationStatus(
    allocationId: string,
    status: 'IN_CUSTODY' | 'PENDING_DELIVERY' | 'DELIVERED' | 'REDEEMED' | 'CANCELLED'
  ): Promise<void> {
    try {
      await db.update(goldAllocations)
        .set({ 
          status,
          updatedAt: new Date()
        })
        .where(eq(goldAllocations.allocationId, allocationId));
      
      console.log(`[GoldConversion] Updated allocation ${allocationId} to status: ${status}`);
      
    } catch (error: any) {
      console.error('[GoldConversionService] Error updating status:', error);
      throw error;
    }
  }
}
