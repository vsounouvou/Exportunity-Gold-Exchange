import { db } from "@db";
import { sql } from "drizzle-orm";
import { seedTenantCommunicationProfiles } from "./sender-resolution";

export async function ensureCommunicationsTables() {
  await db.execute(sql`
    alter table if exists whatsapp_messages
    add column if not exists client_message_id text;
  `);

  await db.execute(sql`
    do $$
    begin
      if to_regclass('public.whatsapp_messages') is not null then
        create unique index if not exists whatsapp_messages_tenant_client_message_id_unique
          on whatsapp_messages (tenant_id, client_message_id)
          where client_message_id is not null;
      end if;
    end
    $$;
  `);

  await db.execute(sql`
    create table if not exists communications_routing_map (
      id serial primary key,
      tenant_id int not null references tenants(id) on delete cascade,
      provider text not null default 'twilio',
      channel text not null,
      to_address text not null,
      agent_key text not null,
      is_enabled boolean not null default true,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);

  await db.execute(sql`
    create unique index if not exists communications_routing_unique_idx
      on communications_routing_map (tenant_id, provider, channel, to_address);
  `);

  await db.execute(sql`
    create index if not exists communications_routing_tenant_idx
      on communications_routing_map (tenant_id, created_at desc);
  `);

  await db.execute(sql`
    create table if not exists communications_agent_controls (
      id serial primary key,
      tenant_id int not null references tenants(id) on delete cascade,
      agent_key text not null,
      sms_enabled boolean not null default true,
      whatsapp_enabled boolean not null default true,
      voice_enabled boolean not null default true,
      sms_daily_outbound_limit int not null default 0,
      whatsapp_daily_outbound_limit int not null default 0,
      voice_daily_outbound_limit int not null default 0,
      voice_dial_to_e164 text,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);

  await db.execute(sql`
    create unique index if not exists communications_agent_controls_unique_idx
      on communications_agent_controls (tenant_id, agent_key);
  `);

  await db.execute(sql`
    create index if not exists communications_agent_controls_tenant_idx
      on communications_agent_controls (tenant_id, created_at desc);
  `);

  await db.execute(sql`
    create table if not exists communications_threads (
      id serial primary key,
      tenant_id int not null references tenants(id) on delete cascade,
      agent_key text not null,
      channel text not null,
      peer_address text not null,
      last_message_at timestamptz not null default now(),
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);

  await db.execute(sql`
    create unique index if not exists communications_threads_unique_idx
      on communications_threads (tenant_id, agent_key, channel, peer_address);
  `);

  await db.execute(sql`
    create index if not exists communications_threads_tenant_last_idx
      on communications_threads (tenant_id, last_message_at desc);
  `);

  await db.execute(sql`
    create index if not exists communications_threads_agent_last_idx
      on communications_threads (agent_key, last_message_at desc);
  `);

  await db.execute(sql`
    create table if not exists communications_messages (
      id serial primary key,
      tenant_id int not null references tenants(id) on delete cascade,
      agent_key text not null,
      thread_id int not null references communications_threads(id) on delete cascade,
      direction text not null,
      status text not null,
      provider text not null default 'twilio',
      channel text not null,
      from_address text not null,
      to_address text not null,
      body text,
      provider_message_id text,
      error_code text,
      error_message text,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);

  await db.execute(sql`
    create unique index if not exists communications_messages_provider_id_idx
      on communications_messages (tenant_id, provider, provider_message_id);
  `);

  await db.execute(sql`
    create index if not exists communications_messages_thread_created_idx
      on communications_messages (thread_id, created_at asc);
  `);

  await db.execute(sql`
    create index if not exists communications_messages_tenant_created_idx
      on communications_messages (tenant_id, created_at desc);
  `);

  await db.execute(sql`
    create table if not exists communications_work_orders (
      id serial primary key,
      tenant_id int not null references tenants(id) on delete cascade,
      agent_key text not null,
      channel text not null,
      thread_id int not null references communications_threads(id) on delete cascade,
      status text not null default 'open',
      peer_address text not null,
      last_inbound_message_id int references communications_messages(id) on delete set null,
      last_inbound_at timestamptz,
      ack_sent_at timestamptz,
      replied_at timestamptz,
      due_at timestamptz,
      last_escalated_at timestamptz,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);

  await db.execute(sql`
    create unique index if not exists communications_work_orders_thread_idx
      on communications_work_orders (thread_id);
  `);

  await db.execute(sql`
    create index if not exists communications_work_orders_tenant_due_idx
      on communications_work_orders (tenant_id, due_at asc);
  `);

  await db.execute(sql`
    create index if not exists communications_work_orders_agent_due_idx
      on communications_work_orders (agent_key, due_at asc);
  `);

  await db.execute(sql`
    create table if not exists communications_events (
      id serial primary key,
      tenant_id int not null references tenants(id) on delete cascade,
      provider text not null default 'twilio',
      event_type text not null,
      event_at timestamptz not null default now(),
      data jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    );
  `);

  await db.execute(sql`
    create index if not exists communications_events_tenant_event_idx
      on communications_events (tenant_id, event_at desc);
  `);

  await db.execute(sql`
    create index if not exists communications_events_provider_event_idx
      on communications_events (provider, event_at desc);
  `);

  await db.execute(sql`
    create table if not exists tenant_communication_profiles (
      id serial primary key,
      tenant_id int not null references tenants(id) on delete cascade,
      is_active boolean not null default true,
      default_channel text not null default 'sms',
      sms_from text,
      whatsapp_from text,
      verify_service_sid text,
      sender_label text,
      default_signature text,
      messaging_service_sid text,
      whatsapp_sender_status text,
      use_sandbox_for_dev boolean not null default false,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);

  await db.execute(sql`
    create unique index if not exists tenant_communication_profiles_tenant_idx
      on tenant_communication_profiles (tenant_id);
  `);

  await db.execute(sql`
    create index if not exists tenant_communication_profiles_tenant_updated_idx
      on tenant_communication_profiles (tenant_id, updated_at desc);
  `);

  await db.execute(sql`
    create index if not exists tenant_communication_profiles_tenant_active_idx
      on tenant_communication_profiles (tenant_id, is_active);
  `);

  await db.execute(sql`
    create table if not exists agent_sender_profiles (
      id serial primary key,
      tenant_id int not null references tenants(id) on delete cascade,
      agent_id int not null references agents(id) on delete cascade,
      is_active boolean not null default true,
      display_name text,
      signature text,
      allowed_channels jsonb not null default '["sms","whatsapp"]'::jsonb,
      sms_from text,
      whatsapp_from text,
      fallback_to_tenant_default boolean not null default true,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);

  await db.execute(sql`
    create unique index if not exists agent_sender_profiles_tenant_agent_idx
      on agent_sender_profiles (tenant_id, agent_id);
  `);

  await db.execute(sql`
    create index if not exists agent_sender_profiles_tenant_idx
      on agent_sender_profiles (tenant_id, created_at desc);
  `);

  await db.execute(sql`
    create index if not exists agent_sender_profiles_agent_updated_idx
      on agent_sender_profiles (agent_id, updated_at desc);
  `);

  await db.execute(sql`
    create table if not exists outbound_message_logs (
      id serial primary key,
      tenant_id int not null references tenants(id) on delete cascade,
      agent_id int references agents(id) on delete set null,
      channel text not null,
      from_address text,
      to_address text not null,
      body text,
      template_name text,
      template_payload jsonb,
      twilio_message_sid text,
      twilio_status text,
      provider_error_code text,
      provider_error_message text,
      provider_response jsonb,
      status text not null default 'queued',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);

  await db.execute(sql`
    create index if not exists outbound_message_logs_tenant_created_idx
      on outbound_message_logs (tenant_id, created_at desc);
  `);

  await db.execute(sql`
    create index if not exists outbound_message_logs_agent_created_idx
      on outbound_message_logs (agent_id, created_at desc);
  `);

  await db.execute(sql`
    create index if not exists outbound_message_logs_twilio_sid_idx
      on outbound_message_logs (twilio_message_sid);
  `);

  await db.execute(sql`
    create index if not exists outbound_message_logs_status_created_idx
      on outbound_message_logs (status, created_at desc);
  `);

  await db.execute(sql`
    create table if not exists inbound_message_logs (
      id serial primary key,
      tenant_id int references tenants(id) on delete set null,
      agent_id int references agents(id) on delete set null,
      from_address text not null,
      to_address text not null,
      body text,
      channel text not null,
      twilio_message_sid text,
      raw_payload jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    );
  `);

  await db.execute(sql`
    create index if not exists inbound_message_logs_tenant_created_idx
      on inbound_message_logs (tenant_id, created_at desc);
  `);

  await db.execute(sql`
    create index if not exists inbound_message_logs_agent_created_idx
      on inbound_message_logs (agent_id, created_at desc);
  `);

  await db.execute(sql`
    create index if not exists inbound_message_logs_twilio_sid_idx
      on inbound_message_logs (twilio_message_sid);
  `);

  await db.execute(sql`
    create index if not exists inbound_message_logs_created_idx
      on inbound_message_logs (created_at desc);
  `);

  await seedTenantCommunicationProfiles();
}
