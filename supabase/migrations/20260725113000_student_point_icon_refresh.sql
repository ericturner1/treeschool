update public.student_point_settings
set icon_key = case icon_key
  when 'spark' then 'bolt'
  when 'gem' then 'diamond'
  when 'leaf' then 'coin'
  else icon_key
end
where icon_key in ('spark', 'gem', 'leaf');

alter table public.student_point_settings
  drop constraint if exists student_point_settings_icon_key_valid;

alter table public.student_point_settings
  add constraint student_point_settings_icon_key_valid
  check (icon_key in ('star', 'coin', 'diamond', 'bolt', 'heart', 'trophy'));
