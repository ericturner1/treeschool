alter table public.student_point_settings
  add column if not exists custom_icon_path text;

update public.student_point_settings
set icon_key = 'star'
where icon_key not in ('star', 'coin', 'diamond');

alter table public.student_point_settings
  drop constraint if exists student_point_settings_icon_key_valid;

alter table public.student_point_settings
  add constraint student_point_settings_icon_key_valid
  check (icon_key in ('star', 'coin', 'diamond', 'custom'));
