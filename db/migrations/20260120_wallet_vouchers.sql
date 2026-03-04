-- Wallet OS - vouchers + batches + redemption audit.

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
  constraint voucher_batches_total_value_check check (total_value > 0),
  constraint voucher_batches_voucher_count_check check (voucher_count > 0),
  constraint voucher_batches_voucher_value_check check (voucher_value > 0),
  constraint voucher_batches_status_check check (status in ('DRAFT', 'ISSUED', 'PARTIALLY_REDEEMED', 'FULLY_REDEEMED', 'CANCELLED'))
);

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
  constraint vouchers_value_check check (value > 0),
  constraint vouchers_status_check check (status in ('NEW', 'ASSIGNED', 'REDEEMED', 'VOID'))
);

create unique index if not exists vouchers_code_hash_unique
  on vouchers (code_hash);

create index if not exists vouchers_batch_idx
  on vouchers (batch_id);

create index if not exists vouchers_status_idx
  on vouchers (status);

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
  constraint voucher_redemptions_status_check check (status in ('COMPLETED', 'REJECTED'))
);

create index if not exists voucher_redemptions_wallet_idx
  on voucher_redemptions (to_wallet_account_id, created_at desc);

