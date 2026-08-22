# Supabase RLS remediation — 2026-08-23

## Finding

Supabase Security Advisor reported `rls_disabled_in_public`. A direct
production-schema review found 72 of 111 tables in the `public` schema without
Row-Level Security. Supabase's `anon` and `authenticated` roles also retained
the platform's default `SELECT`, `INSERT`, `UPDATE`, and `DELETE` grants.

This was a critical exposure because the project URL and anonymous key are
necessarily public, and an external caller could have addressed those tables
through Supabase's generated Data API.

## Architecture decision

Treeschool uses Supabase Auth from the frontend, but application-table access
is server-side through the backend's Postgres connection. The browser does not
query application tables through PostgREST or GraphQL. Therefore the correct
boundary is a closed Data API: browser-facing roles receive no application
table, function, or sequence privileges and no row policies.

## Remediation

- `20260823090000_secure_public_data_plane.sql`
  - enables RLS on every ordinary or partitioned table in `public`;
  - revokes all table privileges from `anon` and `authenticated`;
  - revokes their default table privileges for future migrations owned by
    `postgres`.
- `20260823091000_secure_public_routines_and_sequences.sql`
  - revokes function and sequence privileges from those roles;
  - makes future `postgres`-owned functions and sequences opt-in.
- `20260823092000_revoke_public_function_execution.sql`
  - removes PostgreSQL's implicit `PUBLIC` function-execution grant, which the
    browser roles would otherwise inherit;
  - removes that implicit grant from future `postgres`-owned functions.

An intentionally public Data API object must now be introduced with an
explicit grant and an explicit RLS policy in the same forward migration.

## Production verification

- All 111 public tables have RLS enabled.
- `anon` and `authenticated` have no CRUD privileges on public tables.
- Browser-facing roles have no access to public sequences and cannot execute
  public functions, including through inherited `PUBLIC` grants.
- An anonymous role probe against `public.accounts` fails with permission
  denied.
- The backend can still read through its server-side role.
- The production frontend and backend health endpoint both return HTTP 200.
- Supabase Security Advisor now reports zero errors. Its 111
  `rls_enabled_no_policy` notices are informational and expected for the closed
  server-owned data plane.

## Exposure review and residual risk

Supabase API logs for 2026-08-16 through 2026-08-22 contained zero requests to
`/rest/v1/` and zero requests to `/graphql/v1`. This is evidence that the
generated Data API was not used during the retained period. It cannot prove
that no access occurred before the available log window because detailed query
auditing was not enabled historically.

One unrelated Security Advisor warning remains: leaked-password protection is
disabled. This feature is available on paid Supabase plans and should be
enabled after confirming the intended behavior for Treeschool's limited
password-based parent reauthentication flow.
