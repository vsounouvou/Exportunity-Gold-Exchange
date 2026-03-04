alter table tasks
  add column if not exists objective_id int;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tasks_objective_id_fkey'
  ) then
    alter table tasks
      add constraint tasks_objective_id_fkey
      foreign key (objective_id)
      references goals(id)
      on delete set null;
  end if;
end $$;

create index if not exists tasks_objective_id_idx on tasks(objective_id);

update tasks
set objective_id = goal_id
where objective_id is null
  and goal_id is not null;

