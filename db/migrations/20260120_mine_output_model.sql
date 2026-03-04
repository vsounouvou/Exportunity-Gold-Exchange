alter table if exists sellers
  add column if not exists est_weekly_output_kg numeric(10, 3) default 1.500,
  add column if not exists est_weekly_output_range_min_kg numeric(10, 3) default 1.000,
  add column if not exists est_weekly_output_range_max_kg numeric(10, 3) default 2.000,
  add column if not exists est_weekly_output_confidence text default 'med',
  add column if not exists est_weekly_output_updated_at timestamp,
  add column if not exists est_weekly_output_updated_by text;

update sellers
set
  est_weekly_output_kg = coalesce(est_weekly_output_kg, avg_weekly_output_kg),
  est_weekly_output_range_min_kg = coalesce(est_weekly_output_range_min_kg, avg_weekly_output_kg * 0.6),
  est_weekly_output_range_max_kg = coalesce(est_weekly_output_range_max_kg, avg_weekly_output_kg * 1.2),
  est_weekly_output_updated_at = coalesce(est_weekly_output_updated_at, mine_last_updated_at)
where avg_weekly_output_kg is not null;
