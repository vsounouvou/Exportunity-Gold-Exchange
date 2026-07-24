create table if not exists agoojye_sequence_enrollments (
  id serial primary key,
  tenant_id integer not null references tenants(id) on delete cascade,
  sequence_id integer not null references agoojye_outreach_sequences(id) on delete cascade,
  opportunity_id integer not null references agoojye_sponsor_opportunities(id) on delete cascade,
  contact_id integer not null references agoojye_crm_contacts(id) on delete cascade,
  sender_identity_id integer not null references agoojye_email_identities(id) on delete restrict,
  current_approval_id integer references agoojye_outreach_approvals(id) on delete set null,
  status text not null default 'awaiting_initial_approval',
  current_step integer not null default 0,
  next_run_at timestamptz,
  last_sent_at timestamptz,
  activated_by text,
  activated_at timestamptz,
  stop_reason text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agoojye_sequence_enrollments_status_check
    check (status in ('awaiting_initial_approval','active','stopped','completed','cancelled')),
  constraint agoojye_sequence_enrollments_step_check check (current_step >= 0)
);

create unique index if not exists agoojye_sequence_enrollments_tenant_sequence_contact_uidx
  on agoojye_sequence_enrollments(tenant_id, sequence_id, contact_id);
create index if not exists agoojye_sequence_enrollments_tenant_status_idx
  on agoojye_sequence_enrollments(tenant_id, status, next_run_at);
create index if not exists agoojye_sequence_enrollments_tenant_opportunity_idx
  on agoojye_sequence_enrollments(tenant_id, opportunity_id);
