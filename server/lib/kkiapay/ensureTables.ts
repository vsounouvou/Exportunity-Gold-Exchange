import { db } from "@db";
import { sql } from "drizzle-orm";

export async function ensureKkiapayPaymentsTable() {
  await db.execute(sql`
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
  `);

  await db.execute(sql`
    create table if not exists payments (
      id uuid primary key default gen_random_uuid(),
      tenant_id int not null references tenants(id) on delete cascade,
      provider text not null default 'kkiapay',
      order_id int references marketplace_orders(id) on delete cascade,
      amount int not null,
      currency text not null default 'XOF',
      status payment_status not null default 'pending',
      provider_transaction_id text,
      provider_payload jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);

  await db.execute(sql`
    alter table payments
      add column if not exists provider_payload jsonb;
  `);

  await db.execute(sql`
    alter table payments
      add column if not exists purpose text not null default 'ORDER_PAYMENT',
      add column if not exists target_type text not null default '',
      add column if not exists target_id text not null default '',
      add column if not exists method text not null default 'WIDGET',
      add column if not exists user_id text,
      add column if not exists msisdn text,
      add column if not exists operator text,
      add column if not exists push_status text,
      add column if not exists push_requested_at timestamptz,
      add column if not exists push_confirmed_at timestamptz,
      add column if not exists provider_transaction_ref text,
      add column if not exists credited_at timestamptz,
      add column if not exists metadata jsonb;
  `);

  // Allow non-order payments (wallet topups / payouts).
  await db.execute(sql`
    alter table payments
      alter column order_id drop not null;
  `);

  await db.execute(sql`
    create unique index if not exists payments_provider_transaction_unique
      on payments (provider, provider_transaction_id);
  `);

  await db.execute(sql`
    create unique index if not exists payments_provider_order_unique
      on payments (provider, order_id);
  `);

  await db.execute(sql`
    create index if not exists payments_tenant_status_idx
      on payments (tenant_id, status);
  `);

  await db.execute(sql`
    create index if not exists payments_purpose_target_idx
      on payments (purpose, target_type, target_id);
  `);

  await db.execute(sql`
    create index if not exists payments_tenant_provider_txref_idx
      on payments (tenant_id, provider, provider_transaction_ref);
  `);

  await db.execute(sql`
    create index if not exists payments_tenant_user_created_idx
      on payments (tenant_id, user_id, created_at desc);
  `);
}
