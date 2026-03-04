import { db } from "@db";
import { sql } from "drizzle-orm";

let ensurePromise: Promise<void> | null = null;

const UUID_EXPR = sql`(
  (
    substr(md5(random()::text || clock_timestamp()::text), 1, 8) || '-' ||
    substr(md5(random()::text || clock_timestamp()::text), 1, 4) || '-' ||
    substr(md5(random()::text || clock_timestamp()::text), 1, 4) || '-' ||
    substr(md5(random()::text || clock_timestamp()::text), 1, 4) || '-' ||
    substr(md5(random()::text || clock_timestamp()::text), 1, 12)
  )::uuid
)`;

export async function ensureStampedGoldTables() {
  if (ensurePromise) return ensurePromise;

  ensurePromise = (async () => {
    await db.execute(sql`
      do $$
      begin
        create type stamped_gold_type as enum ('COIN', 'BAR');
      exception
        when duplicate_object then null;
      end $$;
    `);

    await db.execute(sql`
      do $$
      begin
        create type stamped_gold_item_status as enum ('IN_STOCK', 'RESERVED', 'SOLD', 'DELIVERED', 'VOID');
      exception
        when duplicate_object then null;
      end $$;
    `);
    await db.execute(sql`alter type stamped_gold_item_status add value if not exists 'CREATED';`).catch(() => {});
    await db.execute(sql`alter type stamped_gold_item_status add value if not exists 'ASSIGNED';`).catch(() => {});
    await db.execute(sql`alter type stamped_gold_item_status add value if not exists 'ENGRAVED';`).catch(() => {});
    await db.execute(sql`alter type stamped_gold_item_status add value if not exists 'SEALED';`).catch(() => {});
    await db.execute(sql`alter type stamped_gold_item_status add value if not exists 'CERTIFIED';`).catch(() => {});
    await db.execute(sql`alter type stamped_gold_item_status add value if not exists 'IN_VAULT';`).catch(() => {});
    await db.execute(sql`alter type stamped_gold_item_status add value if not exists 'READY_PICKUP';`).catch(() => {});
    await db.execute(sql`alter type stamped_gold_item_status add value if not exists 'OPENED_VOID';`).catch(() => {});

    await db.execute(sql`
      do $$
      begin
        create type stamped_gold_location_type as enum ('VAULT', 'JEWELLER_PARTNER', 'IN_TRANSIT', 'DELIVERED');
      exception
        when duplicate_object then null;
      end $$;
    `);

    await db.execute(sql`
      do $$
      begin
        create type partner_jeweller_stock_mode as enum ('STOCKED', 'JUST_IN_TIME');
      exception
        when duplicate_object then null;
      end $$;
    `);

    await db.execute(sql`
      create table if not exists partner_jewellers (
        id uuid primary key default ${UUID_EXPR},
        tenant_id integer not null references tenants(id) on delete cascade,
        name text not null,
        email text,
        phone text,
        address text,
        latitude numeric(10, 7),
        longitude numeric(10, 7),
        stock_mode partner_jeweller_stock_mode not null default 'JUST_IN_TIME',
        is_active boolean not null default true,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );
    `);
    await db.execute(sql`alter table partner_jewellers add column if not exists email text;`);
    await db.execute(sql`create index if not exists partner_jewellers_tenant_idx on partner_jewellers (tenant_id);`);

    await db.execute(sql`
      create table if not exists stamped_gold_skus (
        id uuid primary key default ${UUID_EXPR},
        tenant_id integer not null references tenants(id) on delete cascade,
        product_id integer references seller_products(id) on delete set null,
        name text,
        sku_code text not null unique,
        stamped_type stamped_gold_type not null default 'BAR',
        product_type text check (product_type in ('BAR', 'COIN')),
        weight_grams integer not null default 0,
        weight_g numeric(10, 3),
        purity text not null default '999.9',
        karat integer,
        metal text not null default 'FINE GOLD',
        brand_text text not null default 'BOURSE DE L''OR',
        serial_prefix text not null default 'BDO',
        hallmark_text text not null default 'HALLMARK',
        year integer,
        requires_legal_stamp boolean not null default true,
        is_active boolean not null default true,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );
    `);
    await db.execute(sql`alter table stamped_gold_skus add column if not exists name text;`);
    await db.execute(sql`alter table stamped_gold_skus add column if not exists product_type text check (product_type in ('BAR', 'COIN'));`);
    await db.execute(sql`alter table stamped_gold_skus add column if not exists weight_g numeric(10, 3);`);
    await db.execute(sql`alter table stamped_gold_skus add column if not exists karat integer;`);
    await db.execute(sql`alter table stamped_gold_skus add column if not exists is_active boolean not null default true;`);
    await db.execute(sql`create index if not exists stamped_gold_skus_tenant_idx on stamped_gold_skus (tenant_id);`);
    await db.execute(sql`create index if not exists stamped_gold_skus_tenant_active_idx on stamped_gold_skus (tenant_id, is_active);`);
    await db.execute(sql`
      update stamped_gold_skus
      set
        name = coalesce(nullif(name, ''), sku_code),
        product_type = coalesce(product_type, stamped_type::text),
        weight_g = coalesce(weight_g, weight_grams::numeric),
        is_active = coalesce(is_active, true)
      where name is null or product_type is null or weight_g is null or is_active is null;
    `).catch(() => {});

    await db.execute(sql`
      create table if not exists stamped_gold_items (
        id uuid primary key default ${UUID_EXPR},
        tenant_id integer not null references tenants(id) on delete cascade,
        sku_id uuid not null references stamped_gold_skus(id) on delete cascade,
        serial_code text not null,
        serial text,
        status stamped_gold_item_status not null default 'IN_STOCK',
        current_location_type stamped_gold_location_type not null default 'VAULT',
        current_location_id uuid references partner_jewellers(id) on delete set null,
        partner_jeweller_id uuid references partner_jewellers(id) on delete set null,
        certificate_id uuid,
        qr_token text,
        minted_at timestamptz not null default now(),
        minted_by text,
        order_id integer references marketplace_orders(id) on delete set null,
        order_item_id integer references marketplace_order_items(id) on delete set null,
        owner_user_id text,
        owner_email text,
        sold_at timestamptz,
        delivered_at timestamptz,
        voided_at timestamptz,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );
    `);
    await db.execute(sql`alter table stamped_gold_items add column if not exists serial text;`);
    await db.execute(sql`alter table stamped_gold_items add column if not exists partner_jeweller_id uuid references partner_jewellers(id) on delete set null;`);
    await db.execute(sql`alter table stamped_gold_items add column if not exists certificate_id uuid;`);
    await db.execute(sql`alter table stamped_gold_items add column if not exists qr_token text;`);
    await db.execute(sql`alter table stamped_gold_items add column if not exists expert_user_id integer references ece_users(id) on delete set null;`);
    await db.execute(sql`create index if not exists stamped_gold_items_tenant_idx on stamped_gold_items (tenant_id);`);
    await db.execute(sql`create index if not exists stamped_gold_items_tenant_partner_idx on stamped_gold_items (tenant_id, partner_jeweller_id);`);
    await db.execute(sql`create index if not exists stamped_gold_items_tenant_status_idx on stamped_gold_items (tenant_id, status);`);
    await db.execute(sql`create unique index if not exists stamped_gold_items_tenant_serial_uniq on stamped_gold_items (tenant_id, serial_code);`);
    await db.execute(sql`create unique index if not exists stamped_gold_items_tenant_serial_alias_uniq on stamped_gold_items (tenant_id, serial);`);
    await db.execute(sql`create unique index if not exists stamped_gold_items_tenant_qr_token_uniq on stamped_gold_items (tenant_id, qr_token);`);
    await db.execute(sql`
      update stamped_gold_items
      set
        serial = coalesce(serial, serial_code),
        partner_jeweller_id = coalesce(
          partner_jeweller_id,
          case when current_location_type = 'JEWELLER_PARTNER' then current_location_id else null end
        ),
        qr_token = coalesce(
          nullif(qr_token, ''),
          substr(md5(random()::text || coalesce(serial_code, '') || clock_timestamp()::text), 1, 32)
        )
      where serial is null
         or (partner_jeweller_id is null and current_location_type = 'JEWELLER_PARTNER')
         or qr_token is null
         or qr_token = '';
    `).catch(() => {});

    await db.execute(sql`
      create table if not exists stamped_gold_certificates (
        id uuid primary key default ${UUID_EXPR},
        tenant_id integer not null references tenants(id) on delete cascade,
        item_id uuid not null unique references stamped_gold_items(id) on delete cascade,
        order_id integer references marketplace_orders(id) on delete set null,
        owner_user_id text,
        owner_email text,
        pickup_partner_id uuid references partner_jewellers(id) on delete set null,
        issued_at timestamptz not null default now()
      );
    `);
    await db.execute(sql`alter table stamped_gold_certificates add column if not exists serial text;`);
    await db.execute(sql`alter table stamped_gold_certificates add column if not exists qr_link text;`);
    await db.execute(sql`alter table stamped_gold_certificates add column if not exists sha256_hash text;`);
    await db.execute(sql`alter table stamped_gold_certificates add column if not exists pdf_url text;`);
    await db.execute(sql`alter table stamped_gold_certificates add column if not exists weight_g numeric(10, 3);`);
    await db.execute(sql`alter table stamped_gold_certificates add column if not exists karat integer;`);
    await db.execute(sql`alter table stamped_gold_certificates add column if not exists expert_user_id integer references ece_users(id) on delete set null;`);

    await db.execute(sql`
      create table if not exists stamped_gold_verification_scans (
        id uuid primary key default ${UUID_EXPR},
        tenant_id integer not null references tenants(id) on delete cascade,
        item_id uuid references stamped_gold_items(id) on delete set null,
        serial_code text not null,
        scanned_by_user_id text,
        scanner_type text not null default 'PUBLIC',
        ip text,
        user_agent text,
        created_at timestamptz not null default now()
      );
    `);
    await db.execute(sql`create index if not exists stamped_gold_scans_tenant_created_idx on stamped_gold_verification_scans (tenant_id, created_at desc);`);
    await db.execute(sql`create index if not exists stamped_gold_scans_serial_idx on stamped_gold_verification_scans (serial_code);`);

    await db.execute(sql`
      create table if not exists partner_jeweller_users (
        id serial primary key,
        tenant_id integer not null references tenants(id) on delete cascade,
        partner_jeweller_id uuid not null references partner_jewellers(id) on delete cascade,
        user_id integer not null references ece_users(id) on delete cascade,
        role text not null check (role in ('OWNER', 'STAFF')),
        created_at timestamptz not null default now(),
        unique (tenant_id, partner_jeweller_id, user_id)
      );
    `);
    await db.execute(sql`create index if not exists partner_jeweller_users_user_idx on partner_jeweller_users (tenant_id, user_id);`);

    await db.execute(sql`
      create table if not exists vault_storage (
        id serial primary key,
        tenant_id integer not null references tenants(id) on delete cascade,
        item_id uuid not null references stamped_gold_items(id) on delete cascade,
        owner_user_id integer not null references ece_users(id) on delete cascade,
        stored_at timestamptz not null default now(),
        released_at timestamptz,
        notes text
      );
    `);
    await db.execute(sql`create index if not exists vault_storage_tenant_idx on vault_storage (tenant_id, stored_at desc);`);
    await db.execute(sql`create index if not exists vault_storage_tenant_item_idx on vault_storage (tenant_id, item_id);`);

    await db.execute(sql`
      create table if not exists gold_price_ticks (
        id serial primary key,
        tenant_id integer not null references tenants(id) on delete cascade,
        source text not null default 'XAUUSD',
        xau_usd numeric(18, 6) not null,
        usd_xof numeric(18, 6) not null,
        created_at timestamptz not null default now()
      );
    `);
    await db.execute(sql`create index if not exists gold_price_ticks_tenant_time_idx on gold_price_ticks (tenant_id, created_at desc);`);

    await db.execute(sql`
      create table if not exists bar_quotes (
        id serial primary key,
        tenant_id integer not null references tenants(id) on delete cascade,
        user_id integer not null references ece_users(id) on delete cascade,
        sku_id uuid not null references stamped_gold_skus(id) on delete cascade,
        price_per_g_xof numeric(18, 2) not null,
        total_xof numeric(18, 2) not null,
        breakdown jsonb not null default '{}'::jsonb,
        valid_until timestamptz not null,
        status text not null check (status in ('ACTIVE', 'EXPIRED', 'USED')) default 'ACTIVE',
        created_at timestamptz not null default now()
      );
    `);
    await db.execute(sql`create index if not exists bar_quotes_tenant_user_idx on bar_quotes (tenant_id, user_id, created_at desc);`);
    await db.execute(sql`create index if not exists bar_quotes_tenant_status_idx on bar_quotes (tenant_id, status, valid_until);`);

    await db.execute(sql`alter table marketplace_orders add column if not exists quote_id integer references bar_quotes(id) on delete set null;`).catch(() => {});
    await db.execute(sql`alter table marketplace_orders add column if not exists pricing_breakdown jsonb;`).catch(() => {});

    await db.execute(sql`
      create table if not exists audit_log (
        id bigserial primary key,
        tenant_id integer not null references tenants(id) on delete cascade,
        item_id uuid,
        previous_status text not null,
        new_status text not null,
        actor_id text,
        actor_role text,
        created_at timestamptz not null default now()
      );
    `);
    await db.execute(sql`create index if not exists audit_log_tenant_created_idx on audit_log (tenant_id, created_at desc);`);
    await db.execute(sql`create index if not exists audit_log_item_idx on audit_log (item_id, created_at desc);`);
    await db.execute(sql`create index if not exists audit_log_tenant_item_idx on audit_log (tenant_id, item_id);`);

    await db.execute(sql`
      create or replace function audit_log_immutable_guard()
      returns trigger
      language plpgsql
      as $$
      begin
        raise exception 'audit_log is immutable';
      end;
      $$;
    `);
    await db.execute(sql`
      do $$
      begin
        if not exists (
          select 1
          from pg_trigger
          where tgname = 'trg_audit_log_no_update'
        ) then
          create trigger trg_audit_log_no_update
          before update on audit_log
          for each row execute function audit_log_immutable_guard();
        end if;
      end $$;
    `);
    await db.execute(sql`
      do $$
      begin
        if not exists (
          select 1
          from pg_trigger
          where tgname = 'trg_audit_log_no_delete'
        ) then
          create trigger trg_audit_log_no_delete
          before delete on audit_log
          for each row execute function audit_log_immutable_guard();
        end if;
      end $$;
    `);
  })();

  return ensurePromise;
}
