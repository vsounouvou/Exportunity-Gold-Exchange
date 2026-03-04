import { db } from "@db";
import { sql } from "drizzle-orm";

export async function ensureMeetTables() {
  await db.execute(sql`
    create type meet_session_status as enum ('scheduled', 'live', 'ended');
  `).catch(() => {});
  await db.execute(sql`
    create type meet_participant_role as enum ('host', 'cohost', 'attendee', 'observer');
  `).catch(() => {});
  await db.execute(sql`
    create type meet_artifact_type as enum ('recording', 'transcript', 'summary', 'email_draft');
  `).catch(() => {});
  await db.execute(sql`
    create type meet_invite_status as enum ('active', 'revoked', 'expired', 'used');
  `).catch(() => {});
  await db.execute(sql`
    create type meet_event_type as enum (
      'participant_joined',
      'participant_left',
      'participant_muted',
      'participant_kicked',
      'meeting_locked',
      'meeting_unlocked',
      'chat_message',
      'recording_uploaded',
      'summary_generated'
    );
  `).catch(() => {});

  await db.execute(sql`
    create table if not exists meet_sessions (
      id text primary key,
      tenant_id int not null references tenants(id) on delete cascade,
      title text not null,
      created_by_user_id int references ece_users(id) on delete set null,
      created_by_agent_id int,
      status meet_session_status not null default 'scheduled',
      starts_at timestamptz,
      ends_at timestamptz,
      locked boolean not null default false,
      recording_enabled boolean not null default false,
      conversation_id text,
      sfu_room_key text,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);
  await db.execute(sql`create index if not exists meet_sessions_tenant_created_idx on meet_sessions (tenant_id, created_at desc);`);
  await db.execute(sql`create index if not exists meet_sessions_tenant_status_idx on meet_sessions (tenant_id, status, updated_at desc);`);
  await db.execute(sql`create index if not exists meet_sessions_tenant_start_idx on meet_sessions (tenant_id, starts_at desc);`);
  await db.execute(sql`create unique index if not exists meet_sessions_conversation_idx on meet_sessions (conversation_id);`);

  await db.execute(sql`
    create table if not exists meet_participants (
      id serial primary key,
      meeting_id text not null references meet_sessions(id) on delete cascade,
      tenant_id int not null references tenants(id) on delete cascade,
      user_id int references ece_users(id) on delete set null,
      guest_email text,
      role meet_participant_role not null default 'attendee',
      display_name text,
      invite_jti_hash text,
      is_muted boolean not null default false,
      is_kicked boolean not null default false,
      joined_at timestamptz,
      left_at timestamptz,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);
  await db.execute(sql`create index if not exists meet_participants_meeting_idx on meet_participants (meeting_id, created_at desc);`);
  await db.execute(sql`create index if not exists meet_participants_tenant_meeting_idx on meet_participants (tenant_id, meeting_id, created_at desc);`);
  await db.execute(sql`create index if not exists meet_participants_tenant_user_idx on meet_participants (tenant_id, user_id, created_at desc);`);

  await db.execute(sql`
    create table if not exists meet_invites (
      id text primary key,
      meeting_id text not null references meet_sessions(id) on delete cascade,
      tenant_id int not null references tenants(id) on delete cascade,
      issued_to text,
      role meet_participant_role not null default 'attendee',
      token_hash text not null,
      token_jti_hash text not null,
      status meet_invite_status not null default 'active',
      expires_at timestamptz not null,
      revoked_at timestamptz,
      used_at timestamptz,
      created_by_user_id int references ece_users(id) on delete set null,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    );
  `);
  await db.execute(sql`create index if not exists meet_invites_meeting_idx on meet_invites (meeting_id, created_at desc);`);
  await db.execute(sql`create index if not exists meet_invites_tenant_idx on meet_invites (tenant_id, created_at desc);`);
  await db.execute(sql`create unique index if not exists meet_invites_token_hash_idx on meet_invites (token_hash);`);
  await db.execute(sql`create unique index if not exists meet_invites_token_jti_hash_idx on meet_invites (token_jti_hash);`);

  await db.execute(sql`
    create table if not exists meet_artifacts (
      id serial primary key,
      meeting_id text not null references meet_sessions(id) on delete cascade,
      tenant_id int not null references tenants(id) on delete cascade,
      type meet_artifact_type not null,
      storage_url text,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    );
  `);
  await db.execute(sql`create index if not exists meet_artifacts_meeting_type_idx on meet_artifacts (meeting_id, type, created_at desc);`);
  await db.execute(sql`create index if not exists meet_artifacts_tenant_idx on meet_artifacts (tenant_id, created_at desc);`);

  await db.execute(sql`
    create table if not exists meet_session_events (
      id serial primary key,
      meeting_id text not null references meet_sessions(id) on delete cascade,
      tenant_id int not null references tenants(id) on delete cascade,
      participant_id int references meet_participants(id) on delete set null,
      event_type meet_event_type not null,
      payload jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    );
  `);
  await db.execute(sql`create index if not exists meet_session_events_meeting_idx on meet_session_events (meeting_id, created_at desc);`);
  await db.execute(sql`create index if not exists meet_session_events_tenant_idx on meet_session_events (tenant_id, created_at desc);`);
}

