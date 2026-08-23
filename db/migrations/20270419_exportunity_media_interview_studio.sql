-- Exportunity governed interviews and provider-neutral media studio.
-- Additive only: canonical public media remains marketing_media_items and
-- source/rights truth remains source_content_references + media_rights_grants.

create table if not exists media_interview_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id integer not null references tenants(id) on delete cascade,
  territory_id integer references geo_territories(id) on delete set null,
  contact_id integer references contacts(id) on delete set null,
  source_reference_id integer references source_content_references(id) on delete set null,
  output_media_item_id text references marketing_media_items(id) on delete set null,
  idempotency_key text not null,
  mode text not null,
  status text not null default 'draft',
  interviewee_name text not null,
  interviewee_role text not null,
  organization_name text not null,
  language text not null default 'en',
  intended_uses jsonb not null default '[]'::jsonb,
  recording_consent_status text not null default 'unknown',
  publication_consent_status text not null default 'unknown',
  ai_processing_consent_status text not null default 'unknown',
  consent_evidence jsonb not null default '{}'::jsonb,
  question_plan jsonb not null default '[]'::jsonb,
  progress jsonb not null default '{}'::jsonb,
  blockers jsonb not null default '[]'::jsonb,
  preparation_action_run_id integer,
  review_action_run_id integer,
  created_by_user_id integer,
  approved_by_user_id integer,
  started_at timestamptz,
  submitted_at timestamptz,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint media_interview_sessions_mode_check check (
    mode in (
      'asynchronous_mobile', 'live_browser', 'live_audio', 'recorded_video_call',
      'in_person_field', 'human_presented_ai_prepared', 'guided_self_recording'
    )
  ),
  constraint media_interview_sessions_status_check check (
    status in (
      'draft', 'consent_pending', 'scheduled', 'in_progress', 'paused',
      'submitted', 'review_required', 'approved', 'rejected', 'cancelled'
    )
  ),
  constraint media_interview_sessions_recording_consent_check check (
    recording_consent_status in ('unknown', 'pending', 'granted', 'declined', 'revoked')
  ),
  constraint media_interview_sessions_publication_consent_check check (
    publication_consent_status in ('unknown', 'pending', 'granted', 'declined', 'revoked')
  ),
  constraint media_interview_sessions_ai_consent_check check (
    ai_processing_consent_status in ('unknown', 'pending', 'granted', 'declined', 'revoked')
  ),
  constraint media_interview_sessions_identity_check check (
    length(btrim(interviewee_name)) > 0 and
    length(btrim(interviewee_role)) > 0 and
    length(btrim(organization_name)) > 0
  ),
  unique (tenant_id, idempotency_key)
);

create index if not exists media_interview_sessions_tenant_status_idx
  on media_interview_sessions(tenant_id, status, updated_at desc);
create index if not exists media_interview_sessions_territory_idx
  on media_interview_sessions(tenant_id, territory_id, updated_at desc);

create table if not exists media_interview_claims (
  id uuid primary key default gen_random_uuid(),
  tenant_id integer not null references tenants(id) on delete cascade,
  session_id uuid not null references media_interview_sessions(id) on delete cascade,
  question_key text not null,
  question_text text not null,
  answer_text text not null,
  claim_category text not null default 'other',
  fact_status text not null default 'UNVERIFIED',
  is_material boolean not null default true,
  confidence_bps integer not null default 0,
  evidence_references jsonb not null default '[]'::jsonb,
  evidence jsonb not null default '{}'::jsonb,
  correction_notes text,
  verified_by_user_id integer,
  verified_at timestamptz,
  interviewee_approved_at timestamptz,
  created_by_user_id integer,
  updated_by_user_id integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint media_interview_claims_fact_status_check check (
    fact_status in (
      'VERIFIED', 'SUPPORTED_BY_DOCUMENT', 'PRODUCER_CLAIM', 'CREATOR_CLAIM',
      'INFERENCE', 'UNVERIFIED', 'OUTDATED'
    )
  ),
  constraint media_interview_claims_category_check check (
    claim_category in (
      'identity', 'story', 'product', 'capacity', 'price', 'packaging',
      'certification', 'buyer_segment', 'export_experience', 'delivery',
      'constraint', 'call_to_action', 'correction', 'other'
    )
  ),
  constraint media_interview_claims_confidence_check check (
    confidence_bps between 0 and 10000
  ),
  constraint media_interview_claims_content_check check (
    length(btrim(question_key)) > 0 and
    length(btrim(question_text)) > 0 and
    length(btrim(answer_text)) > 0
  ),
  unique (session_id, question_key)
);

create index if not exists media_interview_claims_session_fact_status_idx
  on media_interview_claims(tenant_id, session_id, fact_status);

create table if not exists media_interview_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id integer not null references tenants(id) on delete cascade,
  session_id uuid not null references media_interview_sessions(id) on delete cascade,
  claim_id uuid references media_interview_claims(id) on delete set null,
  event_type text not null,
  actor_user_id integer,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists media_interview_events_session_created_idx
  on media_interview_events(tenant_id, session_id, created_at desc);

create table if not exists media_studio_projects (
  id uuid primary key default gen_random_uuid(),
  tenant_id integer not null references tenants(id) on delete cascade,
  territory_id integer references geo_territories(id) on delete set null,
  interview_session_id uuid references media_interview_sessions(id) on delete set null,
  source_reference_id integer references source_content_references(id) on delete set null,
  rights_grant_id integer references media_rights_grants(id) on delete set null,
  source_media_item_id text references marketing_media_items(id) on delete set null,
  output_media_item_id text references marketing_media_items(id) on delete set null,
  idempotency_key text not null,
  title text not null,
  story_angle text,
  language text not null default 'en',
  status text not null default 'draft',
  output_formats jsonb not null default '[]'::jsonb,
  content_plan jsonb not null default '{}'::jsonb,
  compliance_snapshot jsonb not null default '{}'::jsonb,
  blockers jsonb not null default '[]'::jsonb,
  current_version_number integer not null default 0,
  preparation_action_run_id integer,
  external_render_executed boolean not null default false,
  created_by_user_id integer,
  approved_by_user_id integer,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint media_studio_projects_status_check check (
    status in (
      'draft', 'awaiting_source_verification', 'awaiting_rights',
      'awaiting_producer_consent', 'editing', 'compliance_review',
      'awaiting_approval', 'approved', 'rendering', 'ready', 'scheduled',
      'published', 'failed', 'restricted', 'archived', 'revoked'
    )
  ),
  constraint media_studio_projects_title_check check (length(btrim(title)) > 0),
  constraint media_studio_projects_version_check check (current_version_number >= 0),
  unique (tenant_id, idempotency_key)
);

create index if not exists media_studio_projects_tenant_status_idx
  on media_studio_projects(tenant_id, status, updated_at desc);
create index if not exists media_studio_projects_interview_idx
  on media_studio_projects(tenant_id, interview_session_id);

create table if not exists media_studio_assets (
  id uuid primary key default gen_random_uuid(),
  tenant_id integer not null references tenants(id) on delete cascade,
  project_id uuid not null references media_studio_projects(id) on delete cascade,
  source_media_item_id text references marketing_media_items(id) on delete set null,
  asset_role text not null,
  storage_reference text not null,
  original_source text not null,
  owner_name text not null,
  uploader_user_id integer,
  mime_type text,
  sha256 text,
  generation_provider text,
  generation_prompt text,
  ai_generated boolean not null default false,
  rights_status text not null default 'unknown',
  subject_consent_status text not null default 'unknown',
  music_license_status text not null default 'not_applicable',
  modifications jsonb not null default '[]'::jsonb,
  takedown_state text not null default 'clear',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint media_studio_assets_role_check check (
    asset_role in (
      'source_video', 'source_audio', 'interview_recording', 'licensed_creator_media',
      'product_photo', 'brand_file', 'logo', 'document', 'voice_recording',
      'generated_image', 'generated_video_segment', 'stock_media', 'transcript',
      'subtitle', 'thumbnail', 'music', 'other'
    )
  ),
  constraint media_studio_assets_rights_check check (
    rights_status in ('unknown', 'pending', 'granted', 'restricted', 'revoked')
  ),
  constraint media_studio_assets_consent_check check (
    subject_consent_status in ('unknown', 'pending', 'granted', 'declined', 'revoked', 'not_applicable')
  ),
  constraint media_studio_assets_music_check check (
    music_license_status in ('unknown', 'pending', 'granted', 'restricted', 'revoked', 'not_applicable')
  ),
  constraint media_studio_assets_takedown_check check (
    takedown_state in ('clear', 'requested', 'restricted', 'removed', 'disputed')
  ),
  constraint media_studio_assets_reference_check check (
    length(btrim(storage_reference)) > 0 and
    length(btrim(original_source)) > 0 and
    length(btrim(owner_name)) > 0
  ),
  unique (project_id, storage_reference)
);

create index if not exists media_studio_assets_project_role_idx
  on media_studio_assets(tenant_id, project_id, asset_role);

create table if not exists media_studio_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id integer not null references tenants(id) on delete cascade,
  project_id uuid not null references media_studio_projects(id) on delete cascade,
  version_number integer not null,
  status text not null default 'draft',
  storyboard jsonb not null default '[]'::jsonb,
  edit_decision_list jsonb not null default '[]'::jsonb,
  natural_language_commands jsonb not null default '[]'::jsonb,
  output_specifications jsonb not null default '{}'::jsonb,
  claim_ids jsonb not null default '[]'::jsonb,
  review_comments jsonb not null default '[]'::jsonb,
  content_hash text,
  approval_evidence jsonb not null default '{}'::jsonb,
  created_by_user_id integer,
  approved_by_user_id integer,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint media_studio_versions_status_check check (
    status in ('draft', 'review_required', 'approved', 'rejected', 'superseded')
  ),
  constraint media_studio_versions_number_check check (version_number > 0),
  unique (project_id, version_number)
);

create index if not exists media_studio_versions_project_status_idx
  on media_studio_versions(tenant_id, project_id, status);

create table if not exists media_render_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id integer not null references tenants(id) on delete cascade,
  project_id uuid not null references media_studio_projects(id) on delete cascade,
  version_id uuid not null references media_studio_versions(id) on delete restrict,
  idempotency_key text not null,
  output_format text not null,
  status text not null default 'prepared',
  provider text,
  provider_job_reference text,
  cost_estimate_minor integer,
  currency_code text,
  progress_bps integer not null default 0,
  attempt_count integer not null default 0,
  render_specification jsonb not null default '{}'::jsonb,
  input_asset_hashes jsonb not null default '[]'::jsonb,
  output_storage_reference text,
  output_sha256 text,
  failure_diagnostics jsonb not null default '{}'::jsonb,
  external_render_executed boolean not null default false,
  provider_confirmed boolean not null default false,
  preparation_action_run_id integer,
  requested_by_user_id integer,
  approved_by_user_id integer,
  submitted_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint media_render_jobs_status_check check (
    status in (
      'prepared', 'provider_submission_approved', 'provider_submitted',
      'rendering', 'succeeded', 'failed', 'cancelled'
    )
  ),
  constraint media_render_jobs_output_format_check check (
    output_format in (
      'vertical_9_16', 'feed_4_5', 'square_1_1', 'landscape_16_9',
      'duration_15s', 'duration_30s', 'duration_60s', 'feature_3m',
      'long_form_interview', 'audio_only', 'article', 'transcript',
      'subtitle_file', 'thumbnail'
    )
  ),
  constraint media_render_jobs_progress_check check (progress_bps between 0 and 10000),
  constraint media_render_jobs_cost_check check (cost_estimate_minor is null or cost_estimate_minor >= 0),
  constraint media_render_jobs_submission_truth_check check (
    status not in ('provider_submitted', 'rendering', 'succeeded') or (
      external_render_executed = true and
      provider is not null and length(btrim(provider)) > 0 and
      provider_job_reference is not null and length(btrim(provider_job_reference)) > 0 and
      submitted_at is not null
    )
  ),
  constraint media_render_jobs_success_truth_check check (
    status <> 'succeeded' or (
      provider_confirmed = true and
      completed_at is not null and
      output_storage_reference is not null and length(btrim(output_storage_reference)) > 0 and
      output_sha256 is not null and length(btrim(output_sha256)) > 0
    )
  ),
  unique (tenant_id, idempotency_key)
);

create index if not exists media_render_jobs_project_status_idx
  on media_render_jobs(tenant_id, project_id, status, created_at desc);

create table if not exists media_studio_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id integer not null references tenants(id) on delete cascade,
  project_id uuid not null references media_studio_projects(id) on delete cascade,
  version_id uuid references media_studio_versions(id) on delete set null,
  render_job_id uuid references media_render_jobs(id) on delete set null,
  event_type text not null,
  actor_user_id integer,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists media_studio_events_project_created_idx
  on media_studio_events(tenant_id, project_id, created_at desc);

create or replace function prevent_media_studio_event_mutation()
returns trigger as $$
begin
  raise exception 'media interview and studio events are immutable';
end;
$$ language plpgsql;

drop trigger if exists media_interview_events_immutable on media_interview_events;
create trigger media_interview_events_immutable
before update or delete on media_interview_events
for each row execute function prevent_media_studio_event_mutation();

drop trigger if exists media_studio_events_immutable on media_studio_events;
create trigger media_studio_events_immutable
before update or delete on media_studio_events
for each row execute function prevent_media_studio_event_mutation();
