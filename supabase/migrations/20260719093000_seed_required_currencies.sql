-- Currency rows referenced by billing and native workbook catalog records are
-- required application data, not optional development seed data.
insert into public.currencies (code, name, symbol, minor_unit)
values
  ('USD', 'United States Dollar', '$', 2),
  ('JPY', 'Japanese Yen', '¥', 0)
on conflict (code) do update
set
  name = excluded.name,
  symbol = excluded.symbol,
  minor_unit = excluded.minor_unit;
