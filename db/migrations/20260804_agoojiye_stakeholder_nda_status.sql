BEGIN;

ALTER TABLE agoojye_engineering_profiles
  DROP CONSTRAINT IF EXISTS agoojye_engineering_profiles_nda_status_check;

ALTER TABLE agoojye_engineering_profiles
  ADD CONSTRAINT agoojye_engineering_profiles_nda_status_check
  CHECK (nda_status IN ('signed', 'not_recorded', 'registered', 'required'));

COMMIT;
