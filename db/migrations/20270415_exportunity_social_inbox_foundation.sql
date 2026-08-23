-- Exportunity Territory Media-to-Commerce OS
-- Verified social comments/DMs -> canonical Team Inbox, CRM, and paused agent tasks.

create table if not exists social_inbox_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id integer not null references tenants(id) on delete cascade,
  target_id integer references social_publication_targets(id) on delete set null,
  provider text not null,
  platform text not null,
  channel text not null,
  event_type text not null,
  provider_event_id text not null,
  external_account_id text not null,
  external_actor_id text not null,
  external_actor_label text,
  external_thread_id text,
  parent_content_id text,
  parent_content_url text,
  thread_id integer not null references communications_threads(id) on delete restrict,
  message_id integer not null references communications_messages(id) on delete restrict,
  work_order_id integer not null references communications_work_orders(id) on delete restrict,
  contact_id integer references contacts(id) on delete set null,
  agent_task_id integer references agent_tasks(id) on delete set null,
  classification text not null,
  classification_confidence_bps integer not null,
  classification_evidence jsonb not null default '{}'::jsonb,
  moderation_status text not null default 'normal',
  lead_status text not null default 'not_applicable',
  reply_policy_status text not null default 'fact_pack_required',
  verification_evidence jsonb not null default '{}'::jsonb,
  received_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint social_inbox_events_provider_check check (
    provider in ('meta', 'google', 'tiktok', 'linkedin', 'x', 'manual')
  ),
  constraint social_inbox_events_platform_check check (
    platform in ('facebook', 'instagram', 'youtube', 'tiktok', 'linkedin', 'x')
  ),
  constraint social_inbox_events_channel_check check (
    channel in (
      'facebook_comment', 'facebook_messenger',
      'instagram_comment', 'instagram_dm',
      'youtube_comment',
      'tiktok_comment', 'tiktok_dm',
      'linkedin_comment', 'linkedin_dm',
      'x_reply', 'x_dm'
    )
  ),
  constraint social_inbox_events_event_type_check check (
    event_type in ('comment', 'direct_message', 'mention', 'reply')
  ),
  constraint social_inbox_events_classification_check check (
    classification in (
      'interest', 'purchase_request', 'wholesale_request', 'partnership',
      'producer_application', 'creator_application', 'delivery_question',
      'complaint', 'misinformation', 'spam', 'abuse', 'sensitive_issue',
      'press_request'
    )
  ),
  constraint social_inbox_events_confidence_check check (
    classification_confidence_bps between 0 and 10000
  ),
  constraint social_inbox_events_moderation_check check (
    moderation_status in ('normal', 'complaint', 'misinformation', 'spam', 'abuse', 'sensitive')
  ),
  constraint social_inbox_events_lead_status_check check (
    lead_status in ('not_applicable', 'created', 'matched', 'review_required')
  ),
  constraint social_inbox_events_reply_policy_check check (
    reply_policy_status in ('fact_pack_required', 'approval_required', 'human_only', 'adapter_unavailable')
  ),
  constraint social_inbox_events_verification_check check (
    verification_evidence @> '{"verified": true}'::jsonb
  ),
  unique (tenant_id, provider, provider_event_id)
);

create index if not exists social_inbox_events_tenant_received_idx
  on social_inbox_events(tenant_id, received_at desc);
create index if not exists social_inbox_events_thread_idx
  on social_inbox_events(thread_id, received_at desc);
create index if not exists social_inbox_events_classification_idx
  on social_inbox_events(tenant_id, classification, received_at desc);

create table if not exists social_inbox_event_audit (
  id serial primary key,
  tenant_id integer not null references tenants(id) on delete cascade,
  social_inbox_event_id uuid not null references social_inbox_events(id) on delete cascade,
  event_type text not null,
  actor_user_id integer,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists social_inbox_event_audit_event_created_idx
  on social_inbox_event_audit(tenant_id, social_inbox_event_id, created_at desc);
