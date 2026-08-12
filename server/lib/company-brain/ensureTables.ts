import { db } from "@db";
import { sql } from "drizzle-orm";

export async function ensureCompanyBrainTables() {
  await db.execute(sql`
    create table if not exists company_brain_sources (
      id serial primary key,
      tenant_id integer not null references tenants(id) on delete cascade,
      company_id integer references companies(id) on delete cascade,
      connector_type text not null default 'manual',
      provider_source_id text,
      parent_source_id integer,
      title text not null,
      source_url text,
      mime_type text,
      source_type text not null default 'document',
      confidentiality text not null default 'internal',
      business_relevance text not null default 'general',
      permission_snapshot jsonb not null default '{}'::jsonb,
      metadata jsonb not null default '{}'::jsonb,
      content_hash text,
      status text not null default 'active',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);
  await db.execute(sql`create index if not exists company_brain_sources_tenant_status_idx on company_brain_sources (tenant_id, status, updated_at);`);
  await db.execute(sql`create index if not exists company_brain_sources_tenant_company_idx on company_brain_sources (tenant_id, company_id);`);
  await db.execute(sql`create unique index if not exists company_brain_sources_provider_identity_uniq on company_brain_sources (tenant_id, connector_type, provider_source_id);`);

  await db.execute(sql`
    create table if not exists company_brain_source_versions (
      id serial primary key,
      source_id integer not null references company_brain_sources(id) on delete cascade,
      provider_version_id text,
      content_hash text not null,
      extracted_text text,
      storage_ref text,
      source_modified_at timestamptz,
      extraction_status text not null default 'pending',
      security_status text not null default 'pending',
      classification jsonb not null default '{}'::jsonb,
      redactions jsonb not null default '[]'::jsonb,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    );
  `);
  await db.execute(sql`create index if not exists company_brain_source_versions_source_created_idx on company_brain_source_versions (source_id, created_at);`);
  await db.execute(sql`create unique index if not exists company_brain_source_versions_source_hash_uniq on company_brain_source_versions (source_id, content_hash);`);
  await db.execute(sql`create index if not exists company_brain_source_versions_security_status_idx on company_brain_source_versions (security_status, created_at);`);

  await db.execute(sql`
    create table if not exists company_brain_claims (
      id serial primary key,
      tenant_id integer not null references tenants(id) on delete cascade,
      company_id integer references companies(id) on delete cascade,
      canonical_key text not null,
      subject_type text not null default 'company',
      subject_id text,
      claim_text text not null,
      structured_value jsonb not null default '{}'::jsonb,
      period_start timestamptz,
      period_end timestamptz,
      effective_at timestamptz,
      status text not null default 'proposed',
      conflict_status text not null default 'clear',
      confidentiality text not null default 'internal',
      internal_wording text,
      approved_external_wording text,
      current_revision integer not null default 1,
      review_at timestamptz,
      created_by_user_id integer references ece_users(id) on delete set null,
      created_by_agent_id integer references agents(id) on delete set null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);
  await db.execute(sql`create index if not exists company_brain_claims_tenant_key_idx on company_brain_claims (tenant_id, canonical_key, updated_at);`);
  await db.execute(sql`create index if not exists company_brain_claims_tenant_status_idx on company_brain_claims (tenant_id, status, updated_at);`);
  await db.execute(sql`create index if not exists company_brain_claims_tenant_conflict_idx on company_brain_claims (tenant_id, conflict_status, updated_at);`);

  await db.execute(sql`
    create table if not exists company_brain_claim_evidence (
      id serial primary key,
      claim_id integer not null references company_brain_claims(id) on delete cascade,
      source_id integer not null references company_brain_sources(id) on delete cascade,
      source_version_id integer not null references company_brain_source_versions(id) on delete cascade,
      support_type text not null default 'supports',
      excerpt text,
      locator text,
      source_strength text not null default 'unknown',
      confidence numeric(4,3) not null default 0.500,
      created_at timestamptz not null default now()
    );
  `);
  await db.execute(sql`create index if not exists company_brain_claim_evidence_claim_idx on company_brain_claim_evidence (claim_id, created_at);`);
  await db.execute(sql`create index if not exists company_brain_claim_evidence_source_version_idx on company_brain_claim_evidence (source_version_id);`);
  await db.execute(sql`create unique index if not exists company_brain_claim_evidence_unique_idx on company_brain_claim_evidence (claim_id, source_version_id, support_type);`);

  await db.execute(sql`
    create table if not exists company_brain_claim_conflicts (
      id serial primary key,
      claim_id integer not null references company_brain_claims(id) on delete cascade,
      conflicting_claim_id integer references company_brain_claims(id) on delete set null,
      conflict_type text not null default 'value_mismatch',
      summary text not null,
      status text not null default 'open',
      resolution text,
      resolved_by_user_id integer references ece_users(id) on delete set null,
      resolved_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);
  await db.execute(sql`create index if not exists company_brain_claim_conflicts_claim_status_idx on company_brain_claim_conflicts (claim_id, status);`);

  await db.execute(sql`
    create table if not exists company_brain_claim_approvals (
      id serial primary key,
      claim_id integer not null references company_brain_claims(id) on delete cascade,
      approval_scope text not null default 'internal',
      status text not null default 'pending',
      requested_by_user_id integer references ece_users(id) on delete set null,
      requested_by_agent_id integer references agents(id) on delete set null,
      reviewed_by_user_id integer references ece_users(id) on delete set null,
      approved_wording text,
      review_notes text,
      requested_at timestamptz not null default now(),
      reviewed_at timestamptz
    );
  `);
  await db.execute(sql`create index if not exists company_brain_claim_approvals_claim_status_idx on company_brain_claim_approvals (claim_id, status);`);

  await db.execute(sql`
    create table if not exists company_brain_context_packs (
      id serial primary key,
      tenant_id integer not null references tenants(id) on delete cascade,
      company_id integer references companies(id) on delete cascade,
      agent_id integer references agents(id) on delete set null,
      conversation_id text,
      correlation_id text,
      task_key text not null,
      purpose text not null default 'internal',
      authority_snapshot jsonb not null default '{}'::jsonb,
      payload jsonb not null default '{}'::jsonb,
      source_citations jsonb not null default '[]'::jsonb,
      conflict_summaries jsonb not null default '[]'::jsonb,
      freshness jsonb not null default '{}'::jsonb,
      redactions jsonb not null default '[]'::jsonb,
      status text not null default 'assembled',
      created_at timestamptz not null default now(),
      expires_at timestamptz
    );
  `);
  await db.execute(sql`create index if not exists company_brain_context_packs_tenant_created_idx on company_brain_context_packs (tenant_id, created_at);`);
  await db.execute(sql`create index if not exists company_brain_context_packs_agent_created_idx on company_brain_context_packs (agent_id, created_at);`);
  await db.execute(sql`create index if not exists company_brain_context_packs_correlation_idx on company_brain_context_packs (correlation_id);`);

  await db.execute(sql`
    create table if not exists company_brain_audit_events (
      id serial primary key,
      tenant_id integer not null references tenants(id) on delete cascade,
      company_id integer references companies(id) on delete cascade,
      actor_type text not null,
      actor_id text,
      event_type text not null,
      entity_type text not null,
      entity_id text,
      correlation_id text,
      payload jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    );
  `);
  await db.execute(sql`create index if not exists company_brain_audit_events_tenant_created_idx on company_brain_audit_events (tenant_id, created_at);`);
  await db.execute(sql`create index if not exists company_brain_audit_events_entity_idx on company_brain_audit_events (entity_type, entity_id, created_at);`);
  await db.execute(sql`create index if not exists company_brain_audit_events_correlation_idx on company_brain_audit_events (correlation_id);`);
}
