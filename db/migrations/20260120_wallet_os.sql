-- Wallet OS (global credits ledger) - core tables.
-- Designed to be tenant-agnostic (wallet is shared across Exportunity tenants).

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

create unique index if not exists wallet_accounts_user_currency_unique
  on wallet_accounts (user_id, currency);

create index if not exists wallet_accounts_user_idx
  on wallet_accounts (user_id);

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

create index if not exists wallet_ledger_wallet_created_idx
  on wallet_ledger_entries (wallet_account_id, created_at desc);

create index if not exists wallet_ledger_reference_idx
  on wallet_ledger_entries (reference_type, reference_id);

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

create index if not exists wallet_transfers_from_idx
  on wallet_transfers (from_wallet_account_id, created_at desc);

create index if not exists wallet_transfers_to_idx
  on wallet_transfers (to_wallet_account_id, created_at desc);

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

create index if not exists wallet_topups_wallet_idx
  on wallet_topups (wallet_account_id, created_at desc);

create index if not exists wallet_topups_status_idx
  on wallet_topups (status);

