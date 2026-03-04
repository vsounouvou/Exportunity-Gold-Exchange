import { relations } from "drizzle-orm";
import { boolean, integer, jsonb, pgTable, serial, text, timestamp, decimal, pgEnum, uuid, uniqueIndex, index } from "drizzle-orm/pg-core";
import { companies } from "../schema";
import { tenants } from "./tenants";
import { marketplaceOrders } from "./marketplace";

// ========================================
// PAYMENT GATEWAY SCHEMA
// ========================================

// Payment status enum
export const paymentStatusEnum = pgEnum('payment_status', [
  'pending', 'processing', 'succeeded', 'failed', 'cancelled', 'refunded'
]);

// Payout status enum
export const payoutStatusEnum = pgEnum('payout_status', [
  'pending', 'processing', 'completed', 'failed', 'cancelled'
]);

// Transaction type enum
export const transactionTypeEnum = pgEnum('transaction_type', [
  'payment', 'refund', 'payout', 'fee', 'adjustment', 'gold_conversion'
]);

// Payment provider enum
export const paymentProviderEnum = pgEnum('payment_provider', [
  'flutterwave', 'paystack', 'stripe', 'internal'
]);

// ========================================
// TENANT PAYMENTS (Multi-tenant checkout)
// ========================================

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),

    provider: text("provider").notNull().default("kkiapay"),

    purpose: text("purpose").notNull().default("ORDER_PAYMENT"),
    targetType: text("target_type").notNull().default(""),
    targetId: text("target_id").notNull().default(""),

    method: text("method").notNull().default("WIDGET"),
    msisdn: text("msisdn"),
    operator: text("operator"),
    userId: text("user_id"),
    pushStatus: text("push_status"),
    pushRequestedAt: timestamp("push_requested_at", { withTimezone: true }),
    pushConfirmedAt: timestamp("push_confirmed_at", { withTimezone: true }),

    orderId: integer("order_id").references(() => marketplaceOrders.id, { onDelete: "cascade" }),

    amount: integer("amount").notNull(),
    currency: text("currency").notNull().default("XOF"),

    status: paymentStatusEnum("status").notNull().default("pending"),

    providerTransactionId: text("provider_transaction_id"),
    providerTransactionRef: text("provider_transaction_ref"),
    providerPayload: jsonb("provider_payload").$type<Record<string, any> | null>(),
    creditedAt: timestamp("credited_at", { withTimezone: true }),
    metadata: jsonb("metadata").$type<Record<string, any> | null>(),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    providerTransactionUnique: uniqueIndex("payments_provider_transaction_unique").on(t.provider, t.providerTransactionId),
    providerOrderUnique: uniqueIndex("payments_provider_order_unique").on(t.provider, t.orderId),
    byTenantStatus: index("payments_tenant_status_idx").on(t.tenantId, t.status),
    byPurposeTarget: index("payments_purpose_target_idx").on(t.purpose, t.targetType, t.targetId),
    byTenantProviderTxRef: index("payments_tenant_provider_txref_idx").on(t.tenantId, t.provider, t.providerTransactionRef),
    byTenantUserCreated: index("payments_tenant_user_created_idx").on(t.tenantId, t.userId, t.createdAt),
  }),
);

// ========================================
// CHECKOUT & PAYMENT SESSIONS
// ========================================

export const checkoutSessions = pgTable('checkout_sessions', {
  id: serial('id').primaryKey(),
  sessionId: text('session_id').notNull().unique(), // Public session identifier
  companyId: integer('company_id').references(() => companies.id, { onDelete: 'cascade' }).notNull(),
  
  // Payment details
  amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
  currency: text('currency').notNull().default('XOF'),
  description: text('description'),
  
  // Customer info (optional)
  customerEmail: text('customer_email'),
  customerPhone: text('customer_phone'),
  customerName: text('customer_name'),
  
  // Session configuration
  successUrl: text('success_url'),
  cancelUrl: text('cancel_url'),
  expiresAt: timestamp('expires_at'),
  
  // Status tracking
  status: paymentStatusEnum('status').notNull().default('pending'),
  paymentIntentId: integer('payment_intent_id'),
  
  // Metadata
  metadata: jsonb('metadata').$type<{
    orderId?: string;
    invoiceId?: string;
    departmentId?: number;
    branchId?: number;
    customFields?: Record<string, any>;
  }>().default({}),
  
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

// ========================================
// PAYMENT INTENTS (Provider-agnostic)
// ========================================

export const paymentIntents = pgTable('payment_intents', {
  id: serial('id').primaryKey(),
  intentId: text('intent_id').notNull().unique(), // Internal unique ID
  
  companyId: integer('company_id').references(() => companies.id, { onDelete: 'cascade' }).notNull(),
  checkoutSessionId: integer('checkout_session_id').references(() => checkoutSessions.id),
  
  // Payment details
  amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
  currency: text('currency').notNull().default('XOF'),
  description: text('description'),
  
  // Provider details
  provider: paymentProviderEnum('provider').notNull().default('flutterwave'),
  providerTransactionId: text('provider_transaction_id'), // Provider's reference
  providerTransactionRef: text('provider_transaction_ref'), // Provider's unique ref
  paymentUrl: text('payment_url'), // Redirect URL for payment
  
  // Payment method
  paymentMethod: text('payment_method'), // card, mobile_money, bank_transfer, qr
  paymentDetails: jsonb('payment_details').$type<{
    cardBrand?: string;
    cardLast4?: string;
    mobileMoneyProvider?: string;
    bankName?: string;
  }>().default({}),
  
  // Status
  status: paymentStatusEnum('status').notNull().default('pending'),
  failureReason: text('failure_reason'),
  
  // Fees
  platformFee: decimal('platform_fee', { precision: 15, scale: 2 }).default('0.00'),
  providerFee: decimal('provider_fee', { precision: 15, scale: 2 }).default('0.00'),
  netAmount: decimal('net_amount', { precision: 15, scale: 2 }),
  
  // Timestamps
  paidAt: timestamp('paid_at'),
  cancelledAt: timestamp('cancelled_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

// ========================================
// PAYMENT LINKS & QR CODES
// ========================================

export const paymentLinks = pgTable('payment_links', {
  id: serial('id').primaryKey(),
  linkId: text('link_id').notNull().unique(), // Short unique identifier
  companyId: integer('company_id').references(() => companies.id, { onDelete: 'cascade' }).notNull(),
  
  // Link configuration
  name: text('name'), // Internal name for merchant
  amount: decimal('amount', { precision: 15, scale: 2 }), // null = variable amount
  currency: text('currency').notNull().default('XOF'),
  description: text('description'),
  
  // QR code
  qrCodeUrl: text('qr_code_url'),
  qrCodeImage: text('qr_code_image'), // Base64 or file path
  
  // Settings
  active: boolean('active').default(true),
  expiresAt: timestamp('expires_at'), // null = never expires
  maxUses: integer('max_uses'), // null = unlimited
  usedCount: integer('used_count').default(0),
  
  // Metadata
  metadata: jsonb('metadata').default({}),
  
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

// ========================================
// MERCHANT ACCOUNTS & BALANCES
// ========================================

export const merchantAccounts = pgTable('merchant_accounts', {
  id: serial('id').primaryKey(),
  companyId: integer('company_id').references(() => companies.id, { onDelete: 'cascade' }).notNull().unique(),
  
  // Balances
  availableBalance: decimal('available_balance', { precision: 15, scale: 2 }).notNull().default('0.00'),
  pendingBalance: decimal('pending_balance', { precision: 15, scale: 2 }).notNull().default('0.00'),
  currency: text('currency').notNull().default('XOF'),
  
  // Multi-currency support (future)
  balances: jsonb('balances').$type<Record<string, {
    available: string;
    pending: string;
  }>>().default({}),
  
  // Statistics
  totalReceived: decimal('total_received', { precision: 15, scale: 2 }).default('0.00'),
  totalPaidOut: decimal('total_paid_out', { precision: 15, scale: 2 }).default('0.00'),
  totalFees: decimal('total_fees', { precision: 15, scale: 2 }).default('0.00'),
  
  // Bank account for payouts
  bankAccountName: text('bank_account_name'),
  bankAccountNumber: text('bank_account_number'),
  bankName: text('bank_name'),
  bankCode: text('bank_code'),
  
  // Mobile money for payouts
  mobileMoneyNumber: text('mobile_money_number'),
  mobileMoneyProvider: text('mobile_money_provider'),
  
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

// ========================================
// PAYOUTS
// ========================================

export const payouts = pgTable('payouts', {
  id: serial('id').primaryKey(),
  payoutId: text('payout_id').notNull().unique(),
  
  companyId: integer('company_id').references(() => companies.id, { onDelete: 'cascade' }).notNull(),
  merchantAccountId: integer('merchant_account_id').references(() => merchantAccounts.id).notNull(),
  
  // Payout details
  amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
  currency: text('currency').notNull().default('XOF'),
  
  // Destination
  destination: text('destination'), // bank_account, mobile_money
  destinationDetails: jsonb('destination_details').$type<{
    accountNumber?: string;
    bankName?: string;
    mobileNumber?: string;
    provider?: string;
  }>().default({}),
  
  // Provider details
  provider: paymentProviderEnum('provider').default('flutterwave'),
  providerPayoutId: text('provider_payout_id'),
  
  // Status
  status: payoutStatusEnum('status').notNull().default('pending'),
  failureReason: text('failure_reason'),
  
  // Fees
  fee: decimal('fee', { precision: 15, scale: 2 }).default('0.00'),
  netAmount: decimal('net_amount', { precision: 15, scale: 2 }),
  
  // Timestamps
  processedAt: timestamp('processed_at'),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

// ========================================
// TRANSACTION LEDGER (Immutable)
// ========================================

export const transactionLedger = pgTable('transaction_ledger', {
  id: serial('id').primaryKey(),
  transactionId: text('transaction_id').notNull().unique(),
  
  companyId: integer('company_id').references(() => companies.id, { onDelete: 'cascade' }).notNull(),
  
  // Transaction details
  type: transactionTypeEnum('type').notNull(),
  amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
  currency: text('currency').notNull().default('XOF'),
  
  // Related entities
  paymentIntentId: integer('payment_intent_id').references(() => paymentIntents.id),
  checkoutSessionId: integer('checkout_session_id').references(() => checkoutSessions.id),
  payoutId: integer('payout_id').references(() => payouts.id),
  
  // Payment details (masked for security)
  payerEmail: text('payer_email'),
  payerPhone: text('payer_phone'),
  payerName: text('payer_name'),
  
  // Provider details
  provider: paymentProviderEnum('provider'),
  providerReference: text('provider_reference'),
  
  // Status
  status: paymentStatusEnum('status').notNull(),
  description: text('description'),
  
  // Balance impact
  balanceBefore: decimal('balance_before', { precision: 15, scale: 2 }),
  balanceAfter: decimal('balance_after', { precision: 15, scale: 2 }),
  balanceType: text('balance_type'), // available, pending
  
  // Metadata
  metadata: jsonb('metadata').$type<{
    orderId?: string;
    invoiceId?: string;
    departmentId?: number;
    branchId?: number;
    goldAllocationId?: number;
  }>().default({}),
  
  createdAt: timestamp('created_at').defaultNow()
});

// ========================================
// GOLD CONVERSION (Optional Feature)
// ========================================

export const goldAllocations = pgTable('gold_allocations', {
  id: serial('id').primaryKey(),
  allocationId: text('allocation_id').notNull().unique(),
  
  companyId: integer('company_id').references(() => companies.id, { onDelete: 'cascade' }),
  customerEmail: text('customer_email'),
  customerPhone: text('customer_phone'),
  customerName: text('customer_name'),
  
  // Conversion details
  fiatAmount: decimal('fiat_amount', { precision: 15, scale: 2 }).notNull(),
  fiatCurrency: text('fiat_currency').notNull().default('XOF'),
  
  // Gold details
  gramsAllocated: decimal('grams_allocated', { precision: 10, scale: 4 }).notNull(),
  goldPricePerGram: decimal('gold_price_per_gram', { precision: 15, scale: 2 }).notNull(),
  goldPriceCurrency: text('gold_price_currency').default('USD'),
  
  // Sourcing & delivery
  status: text('status', {
    enum: ['IN_CUSTODY', 'PENDING_DELIVERY', 'DELIVERED', 'REDEEMED', 'CANCELLED']
  }).notNull().default('IN_CUSTODY'),
  
  deliveryAddress: jsonb('delivery_address').$type<{
    street?: string;
    city?: string;
    country?: string;
    postalCode?: string;
  }>(),
  
  // Links
  paymentIntentId: integer('payment_intent_id').references(() => paymentIntents.id),
  transactionId: integer('transaction_id').references(() => transactionLedger.id),
  
  // Metadata
  metadata: jsonb('metadata').default({}),
  
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

// ========================================
// WEBHOOK EVENTS LOG
// ========================================

export const webhookEvents = pgTable('webhook_events', {
  id: serial('id').primaryKey(),
  provider: paymentProviderEnum('provider').notNull(),
  eventType: text('event_type').notNull(),
  
  // Event data
  providerEventId: text('provider_event_id'),
  payload: jsonb('payload').notNull(),
  signature: text('signature'),
  
  // Processing status
  processed: boolean('processed').default(false),
  processedAt: timestamp('processed_at'),
  processingError: text('processing_error'),
  
  // Idempotency
  idempotencyKey: text('idempotency_key').unique(),
  
  createdAt: timestamp('created_at').defaultNow()
});

// ========================================
// RELATIONS
// ========================================

export const checkoutSessionsRelations = relations(checkoutSessions, ({ one }) => ({
  company: one(companies, {
    fields: [checkoutSessions.companyId],
    references: [companies.id]
  }),
  paymentIntent: one(paymentIntents, {
    fields: [checkoutSessions.paymentIntentId],
    references: [paymentIntents.id]
  })
}));

export const paymentIntentsRelations = relations(paymentIntents, ({ one }) => ({
  company: one(companies, {
    fields: [paymentIntents.companyId],
    references: [companies.id]
  }),
  checkoutSession: one(checkoutSessions, {
    fields: [paymentIntents.checkoutSessionId],
    references: [checkoutSessions.id]
  })
}));

export const merchantAccountsRelations = relations(merchantAccounts, ({ one }) => ({
  company: one(companies, {
    fields: [merchantAccounts.companyId],
    references: [companies.id]
  })
}));

export const payoutsRelations = relations(payouts, ({ one }) => ({
  company: one(companies, {
    fields: [payouts.companyId],
    references: [companies.id]
  }),
  merchantAccount: one(merchantAccounts, {
    fields: [payouts.merchantAccountId],
    references: [merchantAccounts.id]
  })
}));
