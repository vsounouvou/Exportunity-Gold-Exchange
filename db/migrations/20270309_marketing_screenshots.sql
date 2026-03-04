CREATE TABLE IF NOT EXISTS marketing_screenshots (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  module TEXT NOT NULL DEFAULT 'platform',
  caption TEXT,
  image_local_path TEXT NOT NULL,
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  status marketing_record_status NOT NULL DEFAULT 'draft',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS marketing_screenshots_tenant_slug_uniq
  ON marketing_screenshots(tenant_id, slug);
CREATE INDEX IF NOT EXISTS marketing_screenshots_tenant_status_idx
  ON marketing_screenshots(tenant_id, status, sort_order);
CREATE INDEX IF NOT EXISTS marketing_screenshots_tenant_module_idx
  ON marketing_screenshots(tenant_id, module, sort_order);

