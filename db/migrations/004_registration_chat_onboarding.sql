-- Digital onboarding: new role keys + extra application fields

DO $$ BEGIN
  ALTER TYPE ece_user_role ADD VALUE 'mine_owner';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE ece_user_role ADD VALUE 'authorized_gold_buyer';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE ece_user_role ADD VALUE 'jewelry_manufacturer';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE ece_user_role ADD VALUE 'jewelry_reseller';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE ece_user_role ADD VALUE 'machinery_manufacturer';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE ece_user_role ADD VALUE 'machinery_reseller';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE ece_user_role ADD VALUE 'investor';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE trader_applications
  ADD COLUMN IF NOT EXISTS contact text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS postal_code text,
  ADD COLUMN IF NOT EXISTS license_number text,
  ADD COLUMN IF NOT EXISTS mine_subtype text,
  ADD COLUMN IF NOT EXISTS jewelry_subtype text,
  ADD COLUMN IF NOT EXISTS sell_on_platform text,
  ADD COLUMN IF NOT EXISTS investment_range text,
  ADD COLUMN IF NOT EXISTS investor_interest text;

ALTER TABLE trader_applications ALTER COLUMN email DROP NOT NULL;
ALTER TABLE trader_applications ALTER COLUMN company_name DROP NOT NULL;
