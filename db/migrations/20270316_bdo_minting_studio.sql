ALTER TABLE stamped_gold_skus
  ADD COLUMN IF NOT EXISTS design_code text,
  ADD COLUMN IF NOT EXISTS edition_type text,
  ADD COLUMN IF NOT EXISTS origin_country text,
  ADD COLUMN IF NOT EXISTS origin_mine text,
  ADD COLUMN IF NOT EXISTS traceability_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS qr_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS serial_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS personalization_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS vault_eligible boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS jewelry_conversion_eligible boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS image_template_mode text NOT NULL DEFAULT 'ingot_blank',
  ADD COLUMN IF NOT EXISTS display_priority integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS preview_defaults jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE stamped_gold_items
  ADD COLUMN IF NOT EXISTS minting_spec jsonb NOT NULL DEFAULT '{}'::jsonb;
