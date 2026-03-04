-- KKiaPay Push (Mobile Money Push) metadata for tenant-scoped payments.

alter table payments
  add column if not exists method text not null default 'WIDGET',
  add column if not exists msisdn text,
  add column if not exists operator text,
  add column if not exists push_status text,
  add column if not exists push_requested_at timestamptz,
  add column if not exists push_confirmed_at timestamptz;

