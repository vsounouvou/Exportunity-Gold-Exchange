import { db } from "@db";
import { sql } from "drizzle-orm";

export async function ensureNotificationsTables() {
  await db.execute(sql`
    create table if not exists notifications (
      id serial primary key,
      tenant_id int not null references tenants(id) on delete cascade,
      event_key text not null,
      status text not null default 'queued',
      recipient_user_id int references ece_users(id) on delete set null,
      recipient_agent_key text,
      read_by_user_id int references ece_users(id) on delete set null,
      read_at timestamptz,
      title text,
      message text,
      requested_channels jsonb not null default '[]'::jsonb,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);

  await db.execute(sql`
    create index if not exists notifications_tenant_created_idx
      on notifications (tenant_id, created_at desc);
  `);

  await db.execute(sql`
    create index if not exists notifications_tenant_status_idx
      on notifications (tenant_id, status, updated_at desc);
  `);

  await db.execute(sql`
    create table if not exists notification_deliveries (
      id serial primary key,
      tenant_id int not null references tenants(id) on delete cascade,
      notification_id int not null references notifications(id) on delete cascade,
      action_request_id int references action_requests(id) on delete set null,
      channel text not null,
      provider text not null,
      to_address text not null,
      status text not null default 'queued',
      attempt int not null default 1,
      provider_message_id text,
      error_code text,
      error_message text,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);

  await db.execute(sql`
    create index if not exists notification_deliveries_notification_idx
      on notification_deliveries (notification_id, created_at asc);
  `);

  await db.execute(sql`
    create index if not exists notification_deliveries_tenant_created_idx
      on notification_deliveries (tenant_id, created_at desc);
  `);

  await db.execute(sql`
    create index if not exists notification_deliveries_provider_id_idx
      on notification_deliveries (tenant_id, provider, provider_message_id);
  `);
}
