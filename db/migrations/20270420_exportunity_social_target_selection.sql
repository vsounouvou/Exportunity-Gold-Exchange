-- Governed provider target selection: one canonical tenant/platform/account binding.
-- OAuth credentials remain in mindbase_integration_connections and are not copied here.

CREATE UNIQUE INDEX IF NOT EXISTS social_publication_targets_tenant_platform_account_unique
  ON social_publication_targets(tenant_id, platform, external_account_id);
