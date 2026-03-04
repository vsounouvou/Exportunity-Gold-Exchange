begin;

update agents
set
  name = 'Tassi Hangbé',
  display_name = 'Tassi Hangbé',
  updated_at = now()
where
  (
    coalesce(is_terminal_default, false) = true
    and (
      lower(coalesce(role, '')) like '%chairman%assistant%'
      or lower(coalesce(role, '')) like '%terminal%assistant%'
    )
  )
  or (
    (
      lower(coalesce(name, '')) = 'awa bamba'
      or lower(coalesce(name, '')) = 'chloe adjovi'
      or lower(coalesce(name, '')) = 'chloé adjovi'
    )
    and (
      lower(coalesce(role, '')) like '%chairman%assistant%'
      or lower(coalesce(role, '')) like '%terminal%assistant%'
    )
  );

update assistant_threads
set
  assistant_display_name = 'Tassi Hangbé',
  updated_at = now()
where
  lower(coalesce(assistant_display_name, '')) = 'awa bamba'
  or lower(coalesce(assistant_display_name, '')) = 'chloe adjovi'
  or lower(coalesce(assistant_display_name, '')) = 'chloé adjovi';

commit;
