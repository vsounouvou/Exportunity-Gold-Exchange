-- Extend payments table for multi-gateway (Flutterwave + KKiaPay) reconciliation.

alter table payments
  add column if not exists user_id text,
  add column if not exists provider_transaction_ref text,
  add column if not exists credited_at timestamptz,
  add column if not exists metadata jsonb;

create index if not exists payments_tenant_provider_txref_idx
  on payments (tenant_id, provider, provider_transaction_ref);

create index if not exists payments_tenant_user_created_idx
  on payments (tenant_id, user_id, created_at desc);
