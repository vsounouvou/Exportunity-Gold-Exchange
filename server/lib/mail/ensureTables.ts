import { db } from "@db";
import { sql } from "drizzle-orm";

export async function ensureMailEngineTables() {
  await db.execute(sql`
    create table if not exists agent_mailboxes (
      id serial primary key,
      tenant_id int not null references tenants(id) on delete cascade,
      agent_key text not null,
      email text not null,
      mail_user_id int,
      quota_mb int not null default 2048,
      daily_outbound_limit int not null default 0,
      approval_required boolean not null default false,
      is_enabled boolean not null default true,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);

  await db.execute(sql`
    create unique index if not exists agent_mailboxes_tenant_agent_idx
      on agent_mailboxes (tenant_id, agent_key);
  `);

  await db.execute(sql`
    create unique index if not exists agent_mailboxes_email_idx
      on agent_mailboxes (email);
  `);

  await db.execute(sql`
    create index if not exists agent_mailboxes_tenant_created_idx
      on agent_mailboxes (tenant_id, created_at desc);
  `);

  await db.execute(sql`
    create table if not exists agent_email_identities (
      id serial primary key,
      tenant_id int not null references tenants(id) on delete cascade,
      agent_id int references agents(id) on delete cascade,
      agent_key text not null,
      mailbox_id int references agent_mailboxes(id) on delete set null,
      email_account_id int,
      from_email text not null,
      reply_to_email text,
      display_name text,
      smtp_host text,
      smtp_port int,
      smtp_secure boolean not null default false,
      smtp_username text,
      smtp_password_ref text,
      is_enabled boolean not null default true,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);

  await db.execute(sql`
    create unique index if not exists agent_email_identities_tenant_agent_key_idx
      on agent_email_identities (tenant_id, agent_key);
  `);

  await db.execute(sql`
    create unique index if not exists agent_email_identities_tenant_agent_id_idx
      on agent_email_identities (tenant_id, agent_id);
  `);

  await db.execute(sql`
    create index if not exists agent_email_identities_tenant_idx
      on agent_email_identities (tenant_id, created_at desc);
  `);

  await db.execute(sql`
    create table if not exists email_threads (
      id serial primary key,
      tenant_id int not null references tenants(id) on delete cascade,
      agent_key text not null,
      mailbox_id int not null references agent_mailboxes(id) on delete cascade,
      subject_norm text not null,
      subject text,
      last_message_at timestamptz not null default now(),
      created_at timestamptz not null default now()
    );
  `);

  await db.execute(sql`
    create unique index if not exists email_threads_mailbox_subject_idx
      on email_threads (mailbox_id, subject_norm);
  `);

  await db.execute(sql`
    create index if not exists email_threads_mailbox_last_idx
      on email_threads (mailbox_id, last_message_at desc);
  `);

  await db.execute(sql`
    create index if not exists email_threads_tenant_last_idx
      on email_threads (tenant_id, last_message_at desc);
  `);

  await db.execute(sql`
    create table if not exists email_messages (
      id serial primary key,
      tenant_id int not null references tenants(id) on delete cascade,
      agent_key text not null,
      mailbox_id int not null references agent_mailboxes(id) on delete cascade,
      thread_id int references email_threads(id) on delete set null,
      action_request_id int references action_requests(id) on delete set null,
      direction text not null,
      status text not null,
      from_email text not null,
      to_json jsonb not null default '[]'::jsonb,
      cc_json jsonb not null default '[]'::jsonb,
      subject text,
      text_body text,
      html_body text,
      message_id text,
      in_reply_to text,
      references_json jsonb not null default '[]'::jsonb,
      maildir_path text,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    );
  `);

  // Backfill for older installs that created email_messages before action_requests existed.
  await db.execute(sql`
    alter table email_messages
      add column if not exists action_request_id int references action_requests(id) on delete set null;
  `);

  await db.execute(sql`
    create unique index if not exists email_messages_mailbox_message_id_idx
      on email_messages (mailbox_id, message_id);
  `);

  await db.execute(sql`
    create index if not exists email_messages_action_request_idx
      on email_messages (action_request_id, created_at desc);
  `);

  await db.execute(sql`
    create index if not exists email_messages_thread_created_idx
      on email_messages (thread_id, created_at asc);
  `);

  await db.execute(sql`
    create index if not exists email_messages_mailbox_created_idx
      on email_messages (mailbox_id, created_at desc);
  `);

  await db.execute(sql`
    create table if not exists email_send_logs (
      id serial primary key,
      tenant_id int not null references tenants(id) on delete cascade,
      action_request_id int references action_requests(id) on delete set null,
      actor_type text not null default 'agent',
      actor_id int,
      actor_agent_id int references agents(id) on delete set null,
      actor_agent_key text,
      resolved_from_email text not null,
      resolved_reply_to_email text,
      smtp_username_used text,
      to_json jsonb not null default '[]'::jsonb,
      subject text,
      status text not null default 'queued',
      provider_message_id text,
      provider_response jsonb not null default '{}'::jsonb,
      error text,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);

  await db.execute(sql`
    create index if not exists email_send_logs_tenant_created_idx
      on email_send_logs (tenant_id, created_at desc);
  `);

  await db.execute(sql`
    create index if not exists email_send_logs_action_request_idx
      on email_send_logs (action_request_id, created_at desc);
  `);

  await db.execute(sql`
    create index if not exists email_send_logs_tenant_status_idx
      on email_send_logs (tenant_id, status, updated_at desc);
  `);

  await db.execute(sql`
    create table if not exists email_unsubscribes (
      id serial primary key,
      tenant_id int not null references tenants(id) on delete cascade,
      email text not null,
      scope text not null default 'marketing',
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    );
  `);

  await db.execute(sql`
    create unique index if not exists email_unsubscribes_tenant_email_scope_idx
      on email_unsubscribes (tenant_id, email, scope);
  `);

  await db.execute(sql`
    create index if not exists email_unsubscribes_tenant_created_idx
      on email_unsubscribes (tenant_id, created_at desc);
  `);

  await db.execute(sql`
    create table if not exists email_work_orders (
      id serial primary key,
      tenant_id int not null references tenants(id) on delete cascade,
      agent_key text not null,
      mailbox_id int not null references agent_mailboxes(id) on delete cascade,
      thread_id int not null references email_threads(id) on delete cascade,
      status text not null default 'open',
      sender_email text not null,
      last_inbound_message_id int references email_messages(id) on delete set null,
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
    create unique index if not exists email_work_orders_thread_idx
      on email_work_orders (thread_id);
  `);

  await db.execute(sql`
    create index if not exists email_work_orders_mailbox_due_idx
      on email_work_orders (mailbox_id, due_at asc);
  `);

  await db.execute(sql`
    create index if not exists email_work_orders_tenant_due_idx
      on email_work_orders (tenant_id, due_at asc);
  `);

  await db.execute(sql`
    create table if not exists email_attachments_meta (
      id serial primary key,
      tenant_id int not null references tenants(id) on delete cascade,
      message_id int not null references email_messages(id) on delete cascade,
      filename text not null,
      mime_type text not null,
      size_bytes int not null default 0,
      maildir_path text,
      created_at timestamptz not null default now()
    );
  `);

  await db.execute(sql`
    create index if not exists email_attachments_message_idx
      on email_attachments_meta (message_id);
  `);

  await db.execute(sql`
    create index if not exists email_attachments_tenant_created_idx
      on email_attachments_meta (tenant_id, created_at desc);
  `);

  await db.execute(sql`
    create table if not exists email_events (
      id serial primary key,
      tenant_id int not null references tenants(id) on delete cascade,
      agent_key text not null,
      mailbox_id int not null references agent_mailboxes(id) on delete cascade,
      event_type text not null,
      event_at timestamptz not null default now(),
      data jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    );
  `);

  await db.execute(sql`
    create index if not exists email_events_mailbox_event_idx
      on email_events (mailbox_id, event_at desc);
  `);

  await db.execute(sql`
    create index if not exists email_events_tenant_event_idx
      on email_events (tenant_id, event_at desc);
  `);

  // =========================
  // Email assistant UX (drafting + summaries)
  // =========================

  await db.execute(sql`
    create table if not exists email_assistant_agent_policies (
      id serial primary key,
      tenant_id int not null references tenants(id) on delete cascade,
      agent_id int not null references agents(id) on delete cascade,
      is_enabled boolean not null default true,
      read_scope text not null default 'full_thread',
      can_suggest_drafts boolean not null default true,
      can_suggest_summaries boolean not null default true,
      can_suggest_followups boolean not null default true,
      send_mode text not null default 'never',
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);

  await db.execute(sql`
    create unique index if not exists email_assistant_agent_policies_unique_idx
      on email_assistant_agent_policies (tenant_id, agent_id);
  `);

  await db.execute(sql`
    create index if not exists email_assistant_agent_policies_tenant_updated_idx
      on email_assistant_agent_policies (tenant_id, updated_at desc);
  `);

  await db.execute(sql`
    create table if not exists email_thread_insights (
      id serial primary key,
      tenant_id int not null references tenants(id) on delete cascade,
      mailbox_id int not null references agent_mailboxes(id) on delete cascade,
      thread_id int not null references email_threads(id) on delete cascade,
      source_last_message_at timestamptz not null,
      summary_json jsonb not null default '{}'::jsonb,
      next_actions_json jsonb not null default '[]'::jsonb,
      generated_by_agent_id int references agents(id) on delete set null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);

  await db.execute(sql`
    create unique index if not exists email_thread_insights_thread_idx
      on email_thread_insights (thread_id);
  `);

  await db.execute(sql`
    create index if not exists email_thread_insights_tenant_updated_idx
      on email_thread_insights (tenant_id, updated_at desc);
  `);
}
