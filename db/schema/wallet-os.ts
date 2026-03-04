import { relations } from "drizzle-orm";
import { bigint, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export type WalletCurrency = "XOF";
export type WalletAccountStatus = "ACTIVE" | "FROZEN" | "CLOSED";
export type WalletKycLevel = "L0" | "L1" | "L2" | "L3";

export type WalletLedgerDirection = "CREDIT" | "DEBIT";
export type WalletLedgerEntryType =
  | "TOPUP"
  | "PURCHASE"
  | "TRANSFER"
  | "PAYOUT"
  | "FEE"
  | "COMMISSION"
  | "ADJUSTMENT"
  | "REVERSAL"
  | "VOUCHER_REDEEM"
  | "VOUCHER_ISSUE"
  | "SELLER_CASHIN";
export type WalletLedgerReferenceType = "TOPUP" | "ORDER" | "TRANSFER" | "PAYOUT" | "VOUCHER" | "ADMIN_ADJ" | "SELLER_OP";

export type WalletTransferStatus = "PENDING" | "COMPLETED" | "FAILED" | "REVERSED";
export type WalletTopupStatus = "INITIATED" | "PENDING" | "PAID" | "FAILED" | "CANCELLED" | "EXPIRED";
export type WalletPayoutStatus = "REQUESTED" | "PROCESSING" | "SENT" | "COMPLETED" | "FAILED" | "REVERSED";

export type WalletRole = "USER" | "SELLER" | "MASTER_DISTRIBUTOR" | "ADMIN";
export type WalletRoleStatus = "ACTIVE" | "SUSPENDED";

export type VoucherBatchStatus = "DRAFT" | "ISSUED" | "PARTIALLY_REDEEMED" | "FULLY_REDEEMED" | "CANCELLED";
export type VoucherStatus = "NEW" | "ASSIGNED" | "REDEEMED" | "VOID";
export type VoucherRedemptionStatus = "COMPLETED" | "REJECTED";

export const walletAccounts = pgTable("wallet_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  currency: text("currency").$type<WalletCurrency>().notNull().default("XOF"),
  status: text("status").$type<WalletAccountStatus>().notNull().default("ACTIVE"),
  kycLevel: text("kyc_level").$type<WalletKycLevel>().notNull().default("L0"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const walletLedgerEntries = pgTable("wallet_ledger_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  walletAccountId: uuid("wallet_account_id")
    .references(() => walletAccounts.id, { onDelete: "cascade" })
    .notNull(),
  direction: text("direction").$type<WalletLedgerDirection>().notNull(),
  entryType: text("entry_type").$type<WalletLedgerEntryType>().notNull(),
  amount: bigint("amount", { mode: "number" }).notNull(),
  balanceAfter: bigint("balance_after", { mode: "number" }).notNull(),
  referenceType: text("reference_type").$type<WalletLedgerReferenceType>().notNull(),
  referenceId: text("reference_id").notNull(),
  counterpartyWalletId: uuid("counterparty_wallet_id").references(() => walletAccounts.id, { onDelete: "set null" }),
  metadata: jsonb("metadata").$type<Record<string, any>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const walletTransfers = pgTable("wallet_transfers", {
  id: uuid("id").primaryKey().defaultRandom(),
  fromWalletAccountId: uuid("from_wallet_account_id")
    .references(() => walletAccounts.id, { onDelete: "restrict" })
    .notNull(),
  toWalletAccountId: uuid("to_wallet_account_id")
    .references(() => walletAccounts.id, { onDelete: "restrict" })
    .notNull(),
  amount: bigint("amount", { mode: "number" }).notNull(),
  status: text("status").$type<WalletTransferStatus>().notNull(),
  memo: text("memo"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const walletTopups = pgTable("wallet_topups", {
  id: uuid("id").primaryKey().defaultRandom(),
  walletAccountId: uuid("wallet_account_id")
    .references(() => walletAccounts.id, { onDelete: "cascade" })
    .notNull(),
  amount: bigint("amount", { mode: "number" }).notNull(),
  currency: text("currency").$type<WalletCurrency>().notNull().default("XOF"),
  status: text("status").$type<WalletTopupStatus>().notNull(),
  gateway: text("gateway").notNull().default("kkiapay"),
  gatewayPaymentId: uuid("gateway_payment_id"),
  externalRef: text("external_ref"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const walletPayouts = pgTable("wallet_payouts", {
  id: uuid("id").primaryKey().defaultRandom(),
  walletAccountId: uuid("wallet_account_id")
    .references(() => walletAccounts.id, { onDelete: "cascade" })
    .notNull(),
  amount: bigint("amount", { mode: "number" }).notNull(),
  feeAmount: bigint("fee_amount", { mode: "number" }).notNull(),
  netAmount: bigint("net_amount", { mode: "number" }).notNull(),
  currency: text("currency").$type<WalletCurrency>().notNull().default("XOF"),
  status: text("status").$type<WalletPayoutStatus>().notNull(),
  gateway: text("gateway").notNull().default("kkiapay"),
  payoutMethod: text("payout_method").notNull(),
  payoutDestination: jsonb("payout_destination").$type<Record<string, any>>().notNull().default({}),
  externalRef: text("external_ref"),
  failureReason: text("failure_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const walletRoles = pgTable("wallet_roles", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  role: text("role").$type<WalletRole>().notNull(),
  status: text("status").$type<WalletRoleStatus>().notNull().default("ACTIVE"),
  limits: jsonb("limits").$type<Record<string, any>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const voucherBatches = pgTable("voucher_batches", {
  id: uuid("id").primaryKey().defaultRandom(),
  issuerWalletAccountId: uuid("issuer_wallet_account_id")
    .references(() => walletAccounts.id, { onDelete: "restrict" })
    .notNull(),
  currency: text("currency").$type<WalletCurrency>().notNull().default("XOF"),
  totalValue: bigint("total_value", { mode: "number" }).notNull(),
  voucherCount: integer("voucher_count").notNull(),
  voucherValue: bigint("voucher_value", { mode: "number" }).notNull(),
  status: text("status").$type<VoucherBatchStatus>().notNull(),
  commissionScheme: jsonb("commission_scheme").$type<Record<string, any>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const vouchers = pgTable("vouchers", {
  id: uuid("id").primaryKey().defaultRandom(),
  batchId: uuid("batch_id")
    .references(() => voucherBatches.id, { onDelete: "cascade" })
    .notNull(),
  codeHash: text("code_hash").notNull(),
  codeLast4: text("code_last4").notNull(),
  value: bigint("value", { mode: "number" }).notNull(),
  currency: text("currency").$type<WalletCurrency>().notNull().default("XOF"),
  status: text("status").$type<VoucherStatus>().notNull(),
  assignedToSellerWalletId: uuid("assigned_to_seller_wallet_id").references(() => walletAccounts.id, { onDelete: "set null" }),
  redeemedByWalletId: uuid("redeemed_by_wallet_id").references(() => walletAccounts.id, { onDelete: "set null" }),
  redeemedAt: timestamp("redeemed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const voucherRedemptions = pgTable("voucher_redemptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  voucherId: uuid("voucher_id")
    .references(() => vouchers.id, { onDelete: "cascade" })
    .notNull(),
  toWalletAccountId: uuid("to_wallet_account_id")
    .references(() => walletAccounts.id, { onDelete: "cascade" })
    .notNull(),
  amount: bigint("amount", { mode: "number" }).notNull(),
  status: text("status").$type<VoucherRedemptionStatus>().notNull(),
  ip: text("ip"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const walletAccountsRelations = relations(walletAccounts, ({ many }) => ({
  ledger: many(walletLedgerEntries),
  topups: many(walletTopups),
  payouts: many(walletPayouts),
}));

export const walletLedgerEntriesRelations = relations(walletLedgerEntries, ({ one }) => ({
  wallet: one(walletAccounts, { fields: [walletLedgerEntries.walletAccountId], references: [walletAccounts.id] }),
}));

export const walletTopupsRelations = relations(walletTopups, ({ one }) => ({
  wallet: one(walletAccounts, { fields: [walletTopups.walletAccountId], references: [walletAccounts.id] }),
}));

export const walletPayoutsRelations = relations(walletPayouts, ({ one }) => ({
  wallet: one(walletAccounts, { fields: [walletPayouts.walletAccountId], references: [walletAccounts.id] }),
}));

export const voucherBatchesRelations = relations(voucherBatches, ({ one, many }) => ({
  issuerWallet: one(walletAccounts, { fields: [voucherBatches.issuerWalletAccountId], references: [walletAccounts.id] }),
  vouchers: many(vouchers),
}));

export const vouchersRelations = relations(vouchers, ({ one }) => ({
  batch: one(voucherBatches, { fields: [vouchers.batchId], references: [voucherBatches.id] }),
}));

