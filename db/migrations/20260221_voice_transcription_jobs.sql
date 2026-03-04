-- Voice transcription observability jobs
-- Stores per-request status for admin debug panel and provider failure tracing.

create table if not exists transcription_jobs (
  id bigserial primary key,
  tenant_id int not null references tenants(id) on delete cascade,
  user_id int references ece_users(id) on delete set null,
  status text not null check (status in ('SUCCESS', 'FAILED')),
  provider text,
  duration_ms int not null default 0,
  error_code text,
  created_at timestamptz not null default now()
);

create index if not exists transcription_jobs_tenant_created_idx
  on transcription_jobs (tenant_id, created_at desc);

create index if not exists transcription_jobs_tenant_status_created_idx
  on transcription_jobs (tenant_id, status, created_at desc);

