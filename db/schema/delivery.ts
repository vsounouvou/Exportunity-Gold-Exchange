import { relations } from "drizzle-orm";
import { boolean, integer, jsonb, pgTable, serial, text, timestamp, decimal, pgEnum } from "drizzle-orm/pg-core";
import { users, companies } from "../schema";

// ========================================
// DELIVERY SYSTEM ENUMS
// ========================================

export const deliveryAgentStatusEnum = pgEnum('delivery_agent_status', [
  'pending_kyc', 'active', 'suspended', 'low_balance', 'inactive'
]);

export const insuranceTierEnum = pgEnum('insurance_tier', [
  'basic', 'silver', 'gold'
]);

export const walletTransactionTypeEnum = pgEnum('wallet_transaction_type', [
  'deposit', 'withdrawal', 'hold', 'release', 'deduction', 'refund', 'fee', 'commission'
]);

export const deliveryOrderStatusEnum = pgEnum('delivery_order_status', [
  'pending', 'matching', 'assigned', 'pickup_pending', 'picked_up', 'in_transit', 'delivered', 'failed', 'cancelled'
]);

export const orderAssignmentStatusEnum = pgEnum('order_assignment_status', [
  'offered', 'accepted', 'rejected', 'expired', 'completed', 'failed'
]);

export const riskAdjustmentTypeEnum = pgEnum('risk_adjustment_type', [
  'loss', 'damage', 'refund', 'insurance_claim', 'manual_adjustment'
]);

// ========================================
// DELIVERY AGENTS
// ========================================

export const deliveryAgents = pgTable('delivery_agents', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  phone: text('phone').notNull(),
  email: text('email'),
  
  status: deliveryAgentStatusEnum('status').notNull().default('pending_kyc'),
  insuranceTier: insuranceTierEnum('insurance_tier').notNull().default('basic'),
  
  kycStatus: text('kyc_status', { enum: ['pending', 'submitted', 'verified', 'rejected'] }).default('pending'),
  kycDocuments: jsonb('kyc_documents').$type<{
    idType?: string;
    idNumber?: string;
    idFrontUrl?: string;
    idBackUrl?: string;
    selfieUrl?: string;
    proofOfAddressUrl?: string;
    submittedAt?: string;
    verifiedAt?: string;
    rejectionReason?: string;
  }>().default({}),
  
  vehicleType: text('vehicle_type', { enum: ['motorcycle', 'bicycle', 'car', 'van', 'truck', 'walking'] }),
  vehiclePlate: text('vehicle_plate'),
  
  latitude: decimal('latitude', { precision: 10, scale: 7 }),
  longitude: decimal('longitude', { precision: 10, scale: 7 }),
  lastLocationUpdate: timestamp('last_location_update'),
  isOnline: boolean('is_online').default(false),
  
  rating: decimal('rating', { precision: 3, scale: 2 }).default('5.00'),
  totalDeliveries: integer('total_deliveries').default(0),
  successfulDeliveries: integer('successful_deliveries').default(0),
  
  metadata: jsonb('metadata').$type<{
    preferredAreas?: string[];
    workingHours?: { start: string; end: string };
    maxOrderValue?: number;
  }>().default({}),
  
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

// ========================================
// AGENT WALLETS (Deposit System)
// ========================================

export const agentWallets = pgTable('agent_wallets', {
  id: serial('id').primaryKey(),
  agentId: integer('agent_id').references(() => deliveryAgents.id, { onDelete: 'cascade' }).notNull().unique(),
  
  balance: decimal('balance', { precision: 15, scale: 2 }).notNull().default('0.00'),
  heldAmount: decimal('held_amount', { precision: 15, scale: 2 }).notNull().default('0.00'),
  availableBalance: decimal('available_balance', { precision: 15, scale: 2 }).notNull().default('0.00'),
  
  totalDeposited: decimal('total_deposited', { precision: 15, scale: 2 }).default('0.00'),
  totalWithdrawn: decimal('total_withdrawn', { precision: 15, scale: 2 }).default('0.00'),
  totalEarnings: decimal('total_earnings', { precision: 15, scale: 2 }).default('0.00'),
  totalDeductions: decimal('total_deductions', { precision: 15, scale: 2 }).default('0.00'),
  
  currency: text('currency').notNull().default('XOF'),
  minimumBalance: decimal('minimum_balance', { precision: 15, scale: 2 }).default('1000.00'),
  
  lastDepositAt: timestamp('last_deposit_at'),
  lastWithdrawalAt: timestamp('last_withdrawal_at'),
  
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

// ========================================
// DELIVERY WALLET TRANSACTIONS (Ledger)
// ========================================

export const deliveryWalletTransactions = pgTable('delivery_wallet_transactions', {
  id: serial('id').primaryKey(),
  walletId: integer('wallet_id').references(() => agentWallets.id, { onDelete: 'cascade' }).notNull(),
  agentId: integer('agent_id').references(() => deliveryAgents.id, { onDelete: 'cascade' }).notNull(),
  
  type: walletTransactionTypeEnum('type').notNull(),
  amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
  fee: decimal('fee', { precision: 15, scale: 2 }).default('0.00'),
  netAmount: decimal('net_amount', { precision: 15, scale: 2 }).notNull(),
  
  balanceBefore: decimal('balance_before', { precision: 15, scale: 2 }).notNull(),
  balanceAfter: decimal('balance_after', { precision: 15, scale: 2 }).notNull(),
  
  status: text('status', { enum: ['pending', 'completed', 'failed', 'reversed'] }).default('pending'),
  
  referenceType: text('reference_type'),
  referenceId: integer('reference_id'),
  
  paymentMethod: text('payment_method'),
  paymentProvider: text('payment_provider'),
  externalTransactionId: text('external_transaction_id'),
  
  description: text('description'),
  metadata: jsonb('metadata').default({}),
  
  createdAt: timestamp('created_at').defaultNow(),
  completedAt: timestamp('completed_at')
});

// ========================================
// INSURANCE PLANS
// ========================================

export const insurancePlans = pgTable('insurance_plans', {
  id: serial('id').primaryKey(),
  
  tier: insuranceTierEnum('tier').notNull().unique(),
  name: text('name').notNull(),
  description: text('description'),
  
  monthlyFee: decimal('monthly_fee', { precision: 15, scale: 2 }).notNull(),
  depositMultiplier: decimal('deposit_multiplier', { precision: 3, scale: 2 }).notNull(),
  coveragePercentage: integer('coverage_percentage').notNull(),
  
  maxCoverageAmount: decimal('max_coverage_amount', { precision: 15, scale: 2 }),
  
  benefits: jsonb('benefits').$type<string[]>().default([]),
  terms: text('terms'),
  
  isActive: boolean('is_active').default(true),
  
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

// ========================================
// AGENT INSURANCE SUBSCRIPTIONS
// ========================================

export const agentInsuranceSubscriptions = pgTable('agent_insurance_subscriptions', {
  id: serial('id').primaryKey(),
  agentId: integer('agent_id').references(() => deliveryAgents.id, { onDelete: 'cascade' }).notNull(),
  planId: integer('plan_id').references(() => insurancePlans.id, { onDelete: 'restrict' }).notNull(),
  
  status: text('status', { enum: ['active', 'pending_payment', 'cancelled', 'expired'] }).default('pending_payment'),
  
  startDate: timestamp('start_date'),
  endDate: timestamp('end_date'),
  nextBillingDate: timestamp('next_billing_date'),
  
  totalPaid: decimal('total_paid', { precision: 15, scale: 2 }).default('0.00'),
  totalClaims: decimal('total_claims', { precision: 15, scale: 2 }).default('0.00'),
  claimsCount: integer('claims_count').default(0),
  
  autoRenew: boolean('auto_renew').default(true),
  
  metadata: jsonb('metadata').default({}),
  
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

// ========================================
// DELIVERY ORDERS
// ========================================

export const deliveryOrders = pgTable('delivery_orders', {
  id: serial('id').primaryKey(),
  orderId: text('order_id').notNull().unique(),
  companyId: integer('company_id').references(() => companies.id, { onDelete: 'cascade' }),
  
  status: deliveryOrderStatusEnum('status').notNull().default('pending'),
  
  orderValue: decimal('order_value', { precision: 15, scale: 2 }).notNull(),
  deliveryFee: decimal('delivery_fee', { precision: 15, scale: 2 }).notNull(),
  platformFee: decimal('platform_fee', { precision: 15, scale: 2 }).default('0.00'),
  agentEarnings: decimal('agent_earnings', { precision: 15, scale: 2 }),
  currency: text('currency').notNull().default('XOF'),
  
  pickupAddress: text('pickup_address').notNull(),
  pickupLatitude: decimal('pickup_latitude', { precision: 10, scale: 7 }).notNull(),
  pickupLongitude: decimal('pickup_longitude', { precision: 10, scale: 7 }).notNull(),
  pickupContactName: text('pickup_contact_name'),
  pickupContactPhone: text('pickup_contact_phone'),
  pickupInstructions: text('pickup_instructions'),
  
  dropoffAddress: text('dropoff_address').notNull(),
  dropoffLatitude: decimal('dropoff_latitude', { precision: 10, scale: 7 }).notNull(),
  dropoffLongitude: decimal('dropoff_longitude', { precision: 10, scale: 7 }).notNull(),
  dropoffContactName: text('dropoff_contact_name'),
  dropoffContactPhone: text('dropoff_contact_phone'),
  dropoffInstructions: text('dropoff_instructions'),
  
  estimatedDistance: decimal('estimated_distance', { precision: 10, scale: 2 }),
  estimatedDuration: integer('estimated_duration'),
  
  pickupQrCode: text('pickup_qr_code'),
  deliveryQrCode: text('delivery_qr_code'),
  
  packageDescription: text('package_description'),
  packageWeight: decimal('package_weight', { precision: 10, scale: 2 }),
  packageSize: text('package_size', { enum: ['small', 'medium', 'large', 'extra_large'] }),
  isFragile: boolean('is_fragile').default(false),
  requiresSignature: boolean('requires_signature').default(false),
  
  scheduledPickupTime: timestamp('scheduled_pickup_time'),
  actualPickupTime: timestamp('actual_pickup_time'),
  scheduledDeliveryTime: timestamp('scheduled_delivery_time'),
  actualDeliveryTime: timestamp('actual_delivery_time'),
  
  metadata: jsonb('metadata').default({}),
  
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

// ========================================
// ORDER ASSIGNMENTS
// ========================================

export const orderAssignments = pgTable('order_assignments', {
  id: serial('id').primaryKey(),
  orderId: integer('order_id').references(() => deliveryOrders.id, { onDelete: 'cascade' }).notNull(),
  agentId: integer('agent_id').references(() => deliveryAgents.id, { onDelete: 'cascade' }).notNull(),
  
  status: orderAssignmentStatusEnum('status').notNull().default('offered'),
  
  requiredDeposit: decimal('required_deposit', { precision: 15, scale: 2 }).notNull(),
  heldAmount: decimal('held_amount', { precision: 15, scale: 2 }).default('0.00'),
  insuranceCoverage: decimal('insurance_coverage', { precision: 15, scale: 2 }).default('0.00'),
  
  offeredAt: timestamp('offered_at').defaultNow(),
  respondedAt: timestamp('responded_at'),
  expiresAt: timestamp('expires_at'),
  completedAt: timestamp('completed_at'),
  
  rejectionReason: text('rejection_reason'),
  failureReason: text('failure_reason'),
  
  agentDistanceAtOffer: decimal('agent_distance_at_offer', { precision: 10, scale: 2 }),
  agentRatingAtOffer: decimal('agent_rating_at_offer', { precision: 3, scale: 2 }),
  
  metadata: jsonb('metadata').default({}),
  
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

// ========================================
// ORDER SCANS (QR Verification)
// ========================================

export const orderScans = pgTable('order_scans', {
  id: serial('id').primaryKey(),
  orderId: integer('order_id').references(() => deliveryOrders.id, { onDelete: 'cascade' }).notNull(),
  assignmentId: integer('assignment_id').references(() => orderAssignments.id, { onDelete: 'cascade' }),
  agentId: integer('agent_id').references(() => deliveryAgents.id, { onDelete: 'set null' }),
  
  scanType: text('scan_type', { enum: ['pickup', 'delivery'] }).notNull(),
  scannedBy: text('scanned_by', { enum: ['agent', 'sender', 'recipient'] }).notNull(),
  
  qrCode: text('qr_code').notNull(),
  isValid: boolean('is_valid').default(true),
  
  latitude: decimal('latitude', { precision: 10, scale: 7 }),
  longitude: decimal('longitude', { precision: 10, scale: 7 }),
  
  signatureUrl: text('signature_url'),
  photoUrl: text('photo_url'),
  notes: text('notes'),
  
  scannedAt: timestamp('scanned_at').defaultNow(),
  
  metadata: jsonb('metadata').default({})
});

// ========================================
// RISK ADJUSTMENTS
// ========================================

export const riskAdjustments = pgTable('risk_adjustments', {
  id: serial('id').primaryKey(),
  orderId: integer('order_id').references(() => deliveryOrders.id, { onDelete: 'cascade' }).notNull(),
  agentId: integer('agent_id').references(() => deliveryAgents.id, { onDelete: 'cascade' }).notNull(),
  assignmentId: integer('assignment_id').references(() => orderAssignments.id, { onDelete: 'cascade' }),
  
  type: riskAdjustmentTypeEnum('type').notNull(),
  
  amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
  agentDeduction: decimal('agent_deduction', { precision: 15, scale: 2 }).default('0.00'),
  insuranceClaim: decimal('insurance_claim', { precision: 15, scale: 2 }).default('0.00'),
  clientRefund: decimal('client_refund', { precision: 15, scale: 2 }).default('0.00'),
  
  reason: text('reason').notNull(),
  description: text('description'),
  evidenceUrls: jsonb('evidence_urls').$type<string[]>().default([]),
  
  status: text('status', { enum: ['pending', 'approved', 'rejected', 'processed'] }).default('pending'),
  
  reviewedBy: integer('reviewed_by'),
  reviewedAt: timestamp('reviewed_at'),
  reviewNotes: text('review_notes'),
  
  walletTransactionId: integer('wallet_transaction_id'),
  
  metadata: jsonb('metadata').default({}),
  
  createdAt: timestamp('created_at').defaultNow(),
  processedAt: timestamp('processed_at')
});

// ========================================
// FEE REVENUE (Platform Earnings)
// ========================================

export const deliveryFeeRevenue = pgTable('delivery_fee_revenue', {
  id: serial('id').primaryKey(),
  
  source: text('source', { enum: ['deposit_fee', 'withdrawal_fee', 'delivery_commission', 'insurance_premium', 'verification_fee'] }).notNull(),
  
  orderId: integer('order_id').references(() => deliveryOrders.id, { onDelete: 'set null' }),
  agentId: integer('agent_id').references(() => deliveryAgents.id, { onDelete: 'set null' }),
  subscriptionId: integer('subscription_id').references(() => agentInsuranceSubscriptions.id, { onDelete: 'set null' }),
  walletTransactionId: integer('wallet_transaction_id').references(() => deliveryWalletTransactions.id, { onDelete: 'set null' }),
  
  amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
  currency: text('currency').notNull().default('XOF'),
  
  description: text('description'),
  metadata: jsonb('metadata').default({}),
  
  createdAt: timestamp('created_at').defaultNow()
});

// ========================================
// RELATIONS
// ========================================

export const deliveryAgentsRelations = relations(deliveryAgents, ({ one, many }) => ({
  user: one(users, {
    fields: [deliveryAgents.userId],
    references: [users.id]
  }),
  wallet: one(agentWallets, {
    fields: [deliveryAgents.id],
    references: [agentWallets.agentId]
  }),
  subscriptions: many(agentInsuranceSubscriptions),
  assignments: many(orderAssignments),
  scans: many(orderScans),
  riskAdjustments: many(riskAdjustments),
  transactions: many(deliveryWalletTransactions)
}));

export const agentWalletsRelations = relations(agentWallets, ({ one, many }) => ({
  agent: one(deliveryAgents, {
    fields: [agentWallets.agentId],
    references: [deliveryAgents.id]
  }),
  transactions: many(deliveryWalletTransactions)
}));

export const deliveryWalletTransactionsRelations = relations(deliveryWalletTransactions, ({ one }) => ({
  wallet: one(agentWallets, {
    fields: [deliveryWalletTransactions.walletId],
    references: [agentWallets.id]
  }),
  agent: one(deliveryAgents, {
    fields: [deliveryWalletTransactions.agentId],
    references: [deliveryAgents.id]
  })
}));

export const insurancePlansRelations = relations(insurancePlans, ({ many }) => ({
  subscriptions: many(agentInsuranceSubscriptions)
}));

export const agentInsuranceSubscriptionsRelations = relations(agentInsuranceSubscriptions, ({ one }) => ({
  agent: one(deliveryAgents, {
    fields: [agentInsuranceSubscriptions.agentId],
    references: [deliveryAgents.id]
  }),
  plan: one(insurancePlans, {
    fields: [agentInsuranceSubscriptions.planId],
    references: [insurancePlans.id]
  })
}));

export const deliveryOrdersRelations = relations(deliveryOrders, ({ one, many }) => ({
  company: one(companies, {
    fields: [deliveryOrders.companyId],
    references: [companies.id]
  }),
  assignments: many(orderAssignments),
  scans: many(orderScans),
  riskAdjustments: many(riskAdjustments)
}));

export const orderAssignmentsRelations = relations(orderAssignments, ({ one, many }) => ({
  order: one(deliveryOrders, {
    fields: [orderAssignments.orderId],
    references: [deliveryOrders.id]
  }),
  agent: one(deliveryAgents, {
    fields: [orderAssignments.agentId],
    references: [deliveryAgents.id]
  }),
  scans: many(orderScans),
  riskAdjustments: many(riskAdjustments)
}));

export const orderScansRelations = relations(orderScans, ({ one }) => ({
  order: one(deliveryOrders, {
    fields: [orderScans.orderId],
    references: [deliveryOrders.id]
  }),
  assignment: one(orderAssignments, {
    fields: [orderScans.assignmentId],
    references: [orderAssignments.id]
  }),
  agent: one(deliveryAgents, {
    fields: [orderScans.agentId],
    references: [deliveryAgents.id]
  })
}));

export const riskAdjustmentsRelations = relations(riskAdjustments, ({ one }) => ({
  order: one(deliveryOrders, {
    fields: [riskAdjustments.orderId],
    references: [deliveryOrders.id]
  }),
  agent: one(deliveryAgents, {
    fields: [riskAdjustments.agentId],
    references: [deliveryAgents.id]
  }),
  assignment: one(orderAssignments, {
    fields: [riskAdjustments.assignmentId],
    references: [orderAssignments.id]
  })
}));

export const deliveryFeeRevenueRelations = relations(deliveryFeeRevenue, ({ one }) => ({
  order: one(deliveryOrders, {
    fields: [deliveryFeeRevenue.orderId],
    references: [deliveryOrders.id]
  }),
  agent: one(deliveryAgents, {
    fields: [deliveryFeeRevenue.agentId],
    references: [deliveryAgents.id]
  }),
  subscription: one(agentInsuranceSubscriptions, {
    fields: [deliveryFeeRevenue.subscriptionId],
    references: [agentInsuranceSubscriptions.id]
  }),
  transaction: one(deliveryWalletTransactions, {
    fields: [deliveryFeeRevenue.walletTransactionId],
    references: [deliveryWalletTransactions.id]
  })
}));
