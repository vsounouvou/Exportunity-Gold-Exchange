-- Wallet OS - payouts (cash-out) table.

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
  constraint wallet_payouts_fee_check check (fee_amount >= 0),
  constraint wallet_payouts_net_check check (net_amount >= 0),
  constraint wallet_payouts_status_check check (status in ('REQUESTED', 'PROCESSING', 'SENT', 'COMPLETED', 'FAILED', 'REVERSED'))
);

create index if not exists wallet_payouts_wallet_idx
  on wallet_payouts (wallet_account_id, created_at desc);

create index if not exists wallet_payouts_status_idx
  on wallet_payouts (status);

