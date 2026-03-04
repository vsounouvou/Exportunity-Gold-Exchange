import { db } from "@db";
import { sql } from "drizzle-orm";

export async function ensureWalletOsTables() {
  await db.execute(sql`
    create table if not exists wallet_accounts (
      id uuid primary key default gen_random_uuid(),
      user_id text not null,
      currency text not null default 'XOF',
      status text not null default 'ACTIVE',
      kyc_level text not null default 'L0',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint wallet_accounts_status_check check (status in ('ACTIVE', 'FROZEN', 'CLOSED')),
      constraint wallet_accounts_kyc_level_check check (kyc_level in ('L0','L1','L2','L3'))
    );
  `);

  await db.execute(sql`
    create unique index if not exists wallet_accounts_user_currency_unique
      on wallet_accounts (user_id, currency);
  `);

  await db.execute(sql`
    create index if not exists wallet_accounts_user_idx
      on wallet_accounts (user_id);
  `);

  await db.execute(sql`
    create table if not exists wallet_ledger_entries (
      id uuid primary key default gen_random_uuid(),
      wallet_account_id uuid not null references wallet_accounts(id) on delete cascade,
      direction text not null,
      entry_type text not null,
      amount bigint not null,
      balance_after bigint not null,
      reference_type text not null,
      reference_id text not null,
      counterparty_wallet_id uuid references wallet_accounts(id) on delete set null,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      constraint wallet_ledger_direction_check check (direction in ('CREDIT', 'DEBIT')),
      constraint wallet_ledger_amount_check check (amount > 0)
    );
  `);

  await db.execute(sql`
    create index if not exists wallet_ledger_wallet_created_idx
      on wallet_ledger_entries (wallet_account_id, created_at desc);
  `);

  await db.execute(sql`
    create index if not exists wallet_ledger_reference_idx
      on wallet_ledger_entries (reference_type, reference_id);
  `);

  await db.execute(sql`
    create table if not exists wallet_transfers (
      id uuid primary key default gen_random_uuid(),
      from_wallet_account_id uuid not null references wallet_accounts(id) on delete restrict,
      to_wallet_account_id uuid not null references wallet_accounts(id) on delete restrict,
      amount bigint not null,
      status text not null,
      memo text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint wallet_transfers_amount_check check (amount > 0),
      constraint wallet_transfers_status_check check (status in ('PENDING', 'COMPLETED', 'FAILED', 'REVERSED')),
      constraint wallet_transfers_from_to_check check (from_wallet_account_id <> to_wallet_account_id)
    );
  `);

  await db.execute(sql`
    create index if not exists wallet_transfers_from_idx
      on wallet_transfers (from_wallet_account_id, created_at desc);
  `);

  await db.execute(sql`
    create index if not exists wallet_transfers_to_idx
      on wallet_transfers (to_wallet_account_id, created_at desc);
  `);

  await db.execute(sql`
    create table if not exists wallet_topups (
      id uuid primary key default gen_random_uuid(),
      wallet_account_id uuid not null references wallet_accounts(id) on delete cascade,
      amount bigint not null,
      currency text not null default 'XOF',
      status text not null,
      gateway text not null default 'kkiapay',
      gateway_payment_id uuid references payments(id) on delete set null,
      external_ref text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint wallet_topups_amount_check check (amount > 0),
      constraint wallet_topups_status_check check (status in ('INITIATED', 'PENDING', 'PAID', 'FAILED', 'CANCELLED', 'EXPIRED'))
    );
  `);

  await db.execute(sql`
    create index if not exists wallet_topups_wallet_idx
      on wallet_topups (wallet_account_id, created_at desc);
  `);

  await db.execute(sql`
    create index if not exists wallet_topups_status_idx
      on wallet_topups (status);
  `);

  await db.execute(sql`
    create table if not exists wallet_payouts (
      id uuid primary key default gen_random_uuid(),
      wallet_account_id uuid not null references wallet_accounts(id) on delete cascade,
      amount bigint not null,
      fee_amount bigint not null,
      net_amount bigint not null,
      currency text not null default 'XOF',
      status text not null,
      gateway text not null default 'kkiapay',
      payout_method text not null,
      payout_destination jsonb not null default '{}'::jsonb,
      external_ref text,
      failure_reason text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint wallet_payouts_amount_check check (amount > 0),
      constraint wallet_payouts_status_check check (status in ('REQUESTED', 'PROCESSING', 'SENT', 'COMPLETED', 'FAILED', 'REVERSED'))
    );
  `);

  await db.execute(sql`
    create index if not exists wallet_payouts_wallet_idx
      on wallet_payouts (wallet_account_id, created_at desc);
  `);

  await db.execute(sql`
    create index if not exists wallet_payouts_status_idx
      on wallet_payouts (status);
  `);

  await db.execute(sql`
    create table if not exists wallet_roles (
      id uuid primary key default gen_random_uuid(),
      user_id text not null,
      role text not null,
      status text not null default 'ACTIVE',
      limits jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint wallet_roles_status_check check (status in ('ACTIVE', 'SUSPENDED'))
    );
  `);

  await db.execute(sql`
    create unique index if not exists wallet_roles_user_role_unique
      on wallet_roles (user_id, role);
  `);

  await db.execute(sql`
    create table if not exists voucher_batches (
      id uuid primary key default gen_random_uuid(),
      issuer_wallet_account_id uuid not null references wallet_accounts(id) on delete restrict,
      currency text not null default 'XOF',
      total_value bigint not null,
      voucher_count int not null,
      voucher_value bigint not null,
      status text not null,
      commission_scheme jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint voucher_batches_status_check check (status in ('DRAFT','ISSUED','PARTIALLY_REDEEMED','FULLY_REDEEMED','CANCELLED'))
    );
  `);

  await db.execute(sql`
    create table if not exists vouchers (
      id uuid primary key default gen_random_uuid(),
      batch_id uuid not null references voucher_batches(id) on delete cascade,
      code_hash text not null,
      code_last4 text not null,
      value bigint not null,
      currency text not null default 'XOF',
      status text not null,
      assigned_to_seller_wallet_id uuid references wallet_accounts(id) on delete set null,
      redeemed_by_wallet_id uuid references wallet_accounts(id) on delete set null,
      redeemed_at timestamptz,
      created_at timestamptz not null default now(),
      constraint vouchers_status_check check (status in ('NEW','ASSIGNED','REDEEMED','VOID'))
    );
  `);

  await db.execute(sql`
    create unique index if not exists vouchers_code_hash_unique
      on vouchers (code_hash);
  `);

  await db.execute(sql`
    create table if not exists voucher_redemptions (
      id uuid primary key default gen_random_uuid(),
      voucher_id uuid not null references vouchers(id) on delete cascade,
      to_wallet_account_id uuid not null references wallet_accounts(id) on delete cascade,
      amount bigint not null,
      status text not null,
      ip text,
      user_agent text,
      created_at timestamptz not null default now(),
      constraint voucher_redemptions_amount_check check (amount > 0),
      constraint voucher_redemptions_status_check check (status in ('COMPLETED','REJECTED'))
    );
  `);
}

