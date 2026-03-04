-- Extend payments table to support wallet topups/payouts while keeping order payments working.

alter table payments
  add column if not exists purpose text not null default 'ORDER_PAYMENT',
  add column if not exists target_type text not null default '',
  add column if not exists target_id text not null default '';

-- Allow non-order payments (wallet topups / payouts).
alter table payments
  alter column order_id drop not null;

-- Helpful lookup for purpose routing.
create index if not exists payments_purpose_target_idx
  on payments (purpose, target_type, target_id);

