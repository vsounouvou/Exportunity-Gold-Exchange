-- Add neighborhood_contributor to ece_user_role enum (idempotent).

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ece_user_role') THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_enum
      WHERE enumlabel = 'neighborhood_contributor'
        AND enumtypid = 'ece_user_role'::regtype
    ) THEN
      ALTER TYPE ece_user_role ADD VALUE 'neighborhood_contributor';
    END IF;
  END IF;
END $$;
