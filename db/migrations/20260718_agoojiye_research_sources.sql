alter table agoojye_agent_research_records
  add column if not exists source_records_json jsonb not null default '[]'::jsonb;

create index if not exists agoojye_agent_research_sources_gin_idx
  on agoojye_agent_research_records using gin (source_records_json);
