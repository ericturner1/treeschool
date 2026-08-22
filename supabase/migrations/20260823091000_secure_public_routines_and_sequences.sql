-- Public functions and sequences receive permissive Supabase grants by
-- default. Treeschool exposes neither through the browser Data API, so close
-- them alongside the application tables.

revoke all privileges on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from anon, authenticated;

alter default privileges for role postgres in schema public
  revoke all privileges on sequences from anon, authenticated;

alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated;
