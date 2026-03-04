-- KKiaPay / tenant-scoped checkout payments (idempotent).

do $$
begin
  if not exists (select 1 from pg_type where typname = 'payment_status') then
    create type payment_status as enum (
      'pending',
      'processing',
      'succeeded',
      'failed',
      'cancelled',
      'refunded'
    );
  end if;
end
$$;

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id int not null references tenants(id) on delete cascade,
  provider text not null default 'kkiapay',
  order_id int not null references marketplace_orders(id) on delete cascade,
  amount int not null,
  currency text not null default 'XOF',
  status payment_status not null default 'pending',
  provider_transaction_id text,
  provider_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists payments_provider_transaction_unique
  on payments (provider, provider_transaction_id);

create unique index if not exists payments_provider_order_unique
  on payments (provider, order_id);

create index if not exists payments_tenant_status_idx
  on payments (tenant_id, status);

