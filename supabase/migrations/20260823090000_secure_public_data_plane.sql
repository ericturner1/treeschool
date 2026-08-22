-- Treeschool uses Supabase Auth in the browser, but all application-table
-- access is performed by the backend through its server-side Postgres role.
-- Keep the public schema closed to PostgREST's browser-facing roles.

do $secure_public_tables$
declare
  table_record record;
begin
  for table_record in
    select namespace.nspname as schema_name, relation.relname as table_name
    from pg_catalog.pg_class relation
    join pg_catalog.pg_namespace namespace
      on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relkind in ('r', 'p')
      and not relation.relrowsecurity
  loop
    execute format(
      'alter table %I.%I enable row level security',
      table_record.schema_name,
      table_record.table_name
    );
  end loop;
end
$secure_public_tables$;

-- RLS is the primary boundary. Revoking table privileges adds a second layer:
-- disabling RLS accidentally later will not silently expose application data.
revoke all privileges on all tables in schema public from anon, authenticated;

-- New tables created by the migration owner start closed as well. A future
-- intentionally public Data API table must opt in with an explicit grant and
-- an explicit RLS policy in the same migration.
alter default privileges for role postgres in schema public
  revoke all privileges on tables from anon, authenticated;
