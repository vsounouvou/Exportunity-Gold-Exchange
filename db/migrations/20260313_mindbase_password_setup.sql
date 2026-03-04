-- MindBase launch: first-login password setup flow
-- Additive + safe to re-run.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE ece_users
  ALTER COLUMN password_hash DROP NOT NULL;

CREATE TABLE IF NOT EXISTS password_setup_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id integer NOT NULL REFERENCES ece_users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamp NOT NULL,
  used_at timestamp,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS password_setup_tokens_user_created_idx
  ON password_setup_tokens(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS password_setup_tokens_expiry_idx
  ON password_setup_tokens(expires_at);
