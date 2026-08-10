# Application Security Audit — 2026-08-10

## Executive summary

This audit reviewed the Treeschool frontend, backend, database access layer, authentication/session paths, public forms, student-facing authorization, rich HTML rendering, dependency tree, and production HTTP boundary. The review prioritized vulnerabilities that could be exploited remotely with little effort.

The release accompanying this document closes the highest-risk findings discovered in the repository: internal backend routes no longer fail open, student routes verify household ownership, browser sessions are established only after Supabase validates the access token, unsafe browser requests receive same-origin/CSRF checks, stored blog HTML is sanitized, client-facing errors are redacted, security headers are emitted, and vulnerable production dependencies are upgraded or overridden.

No production incident or compromise was established by this source-code audit. Repository review is not a substitute for reviewing production access, authentication, database, payment, and infrastructure logs.

## Scope and method

Reviewed surfaces:

- Next.js pages, route handlers, server actions, middleware, redirects, and dynamic HTML render paths.
- Bun backend routes, internal/public route boundaries, request parsing, error responses, and maintenance endpoints.
- Supabase authentication/session handling and household/student profile access.
- Drizzle/Postgres query construction and raw SQL usage.
- Blog/rich-content storage and rendering.
- Login, signup, funnel lead/event, checkout-offer, and upload initiation paths.
- Cookie attributes, HTTP response headers, environment configuration, tracked secrets, and dependency advisories.

Verification included targeted unit/regression tests, linting, a full production build, runtime header and cross-origin request checks, PDF/runtime dependency smoke tests, and a production-dependency vulnerability scan.

## Findings remediated

| Severity | Finding | Affected area | Remediation |
| --- | --- | --- | --- |
| Critical | Internal backend routes were protected only when `INTERNAL_API_SECRET` happened to be configured, creating a fail-open state. | `app/ts-backend/src/index.ts` | Internal routes now fail closed, require the shared secret, and compare it with a timing-safe check. Production deployment explicitly uses the production environment and Secret Manager value. |
| High | Some student classroom, lesson, quiz, slide-completion, and streak paths trusted the active student identifier without proving that it belonged to the signed-in household. | Frontend student pages/actions and API routes | Added a central student-access check that requires a valid parent session, a student active profile, and membership in that parent’s household. Applied it to the affected read and mutation paths. |
| High | The browser session endpoint accepted supplied tokens and wrote cookies before independently validating the access token. | `app/ts-frontend/app/auth/session/route.ts` | Supabase now validates the access token before account bootstrap or cookie creation. Invalid/expired sessions receive a non-cacheable 401 response. |
| High | Unsafe browser requests relied mainly on cookie behavior and lacked a consistent same-origin gate. | Frontend middleware | Added origin and Fetch Metadata validation for POST/PUT/PATCH/DELETE requests, with the Stripe webhook explicitly exempted because it uses signature verification. |
| High | Redirect and checkout URL construction could derive a public origin from request/forwarded host data. | Auth, billing, checkout, funnel, and offer paths | Added a single trusted public-origin resolver. Production uses the configured canonical origin and does not trust attacker-controlled forwarded host values. |
| High | Production dependency versions included known security advisories. | Root, frontend, backend, and database package manifests/lockfile | Upgraded Next.js/React, Drizzle, PDF.js, canvas, Google Cloud Storage, and pinned safe transitive dependency versions. Adapted the application to the updated Next.js and PDF.js APIs. |
| Medium | Stored blog HTML could preserve unsafe legacy markup and later render it. | Backend blog service and public/admin blog views | Blog HTML is sanitized on write and again on read, protecting both new content and legacy rows. Regression coverage includes executable markup removal. |
| Medium | Raw exception messages could disclose stack, SQL, database schema, credentials, or infrastructure details. | Backend handlers and frontend API routes | Added centralized safe public-error handling and replaced raw exception responses with bounded, redacted messages. Detailed failures remain server-side. |
| Medium | High-risk public endpoints had no common request-rate or body-size controls. | Login/session, funnel submissions/events, checkout offers, and staged uploads | Added conservative per-process rate limits and content-length caps. This is immediate application-layer protection; stronger platform-level controls remain recommended below. |
| Medium | Standard browser hardening headers were incomplete. | Next.js response configuration | Added CSP, HSTS, clickjacking protection, MIME sniffing protection, referrer policy, permissions policy, and related headers. |
| Informational | SQL injection review found no unsafe user-input concatenation into executable SQL in the reviewed application paths. | Drizzle/Postgres access layer | Queries continue to use Drizzle/Postgres parameter binding. Drizzle was upgraded to the patched pinned version. |
| Informational | Authentication passwords are not locally stored or hashed by Treeschool. | Authentication service | Password verification remains delegated to Supabase Auth. Existing application session cookies use `HttpOnly`, production `Secure`, and `SameSite=Lax`. |

The tracked source scan did not find an active production API key, database password, or production private credential. Development-only placeholders and local emulator credentials are not production secrets.

## Remaining operational risk

These items are intentionally recorded as follow-up work. They do not negate the application fixes above, but they matter for defending a public production service.

### 1. Distributed edge rate limiting and bot mitigation — High priority

The new application rate limits are held in each running process. A client can spread traffic across serverless/Cloud Run instances or many source addresses, and application parsing still consumes resources before every attack is stopped.

Recommended follow-up:

- Enable platform/WAF rate limiting for login, signup, password recovery, public forms/events, checkout offers, uploads, and expensive generation/printing endpoints.
- Add managed bot/challenge protection to repeated anonymous submissions.
- Ensure the edge/proxy overwrites rather than appends untrusted forwarding headers before relying on client IP.
- Alert on sustained 401, 403, 413, 429, and 5xx spikes.

### 2. Production log and account review — High priority

A repository audit cannot determine whether someone already probed or accessed production. Review Cloud Run, Vercel, Supabase Auth/Postgres, Google Cloud audit, Stripe, and domain/email provider logs around the threat window.

Recommended follow-up:

- Look for unfamiliar sign-ins, new admins, token/session anomalies, bulk enumeration, export/download spikes, and unusual database or Secret Manager access.
- Revoke unfamiliar sessions and rotate any credential whose handling is uncertain.
- Preserve relevant logs before retention windows expire.

### 3. Administrative account and infrastructure controls — High priority

Source controls cannot enforce the security of the owner’s registrar, DNS, email, GitHub, Vercel, Google Cloud, Supabase, Stripe, or Anthropic accounts.

Recommended follow-up:

- Require phishing-resistant MFA/passkeys where supported; avoid SMS as the only factor.
- Remove unused collaborators and API tokens and keep least-privilege roles.
- Enable billing/security alerts and protect recovery email accounts with the same standard.
- Confirm registrar lock, transfer lock, and verified recovery details.

### 4. Backup and recovery exercise — High priority

Backups are only protective when restore procedures are current and tested. Confirm Supabase point-in-time recovery/backup coverage for the plan in use and independently preserve critical exports where appropriate.

Recommended follow-up:

- Document recovery time and recovery point objectives.
- Test restoration into an isolated environment without touching production.
- Verify that workbook/PDF objects and configuration needed for recovery are covered, not only Postgres rows.

### 5. Stronger Content Security Policy — Medium priority

The new CSP substantially narrows browser capabilities, but Next.js compatibility currently requires `'unsafe-inline'` for scripts/styles. That weakens CSP as a final defense if an HTML injection is introduced later.

Recommended follow-up:

- Move scripts to nonce- or hash-based authorization and remove `'unsafe-inline'` from `script-src`.
- Reduce inline styles where practical, then remove `'unsafe-inline'` from `style-src`.
- Introduce CSP reporting in report-only mode before each tightening step.

### 6. Centralized authorization policy and regression coverage — Medium priority

The immediate student-profile gaps were patched, but authorization is still implemented across route handlers, server actions, and backend services. New endpoints could repeat an ownership-check omission.

Recommended follow-up:

- Require shared parent/admin/student authorization helpers for every new sensitive route.
- Add negative integration tests proving that one household cannot read or mutate another household’s identifiers.
- Periodically enumerate all state-changing and identifier-based routes and verify their policy.

### 7. Development-only dependency advisories — Low priority

The production install scan is clean for known runtime advisories after the pinned upgrades. The full development lock graph still contains advisories under build/test tooling (`brace-expansion`, `picomatch`, and an older `esbuild` path). These are not installed in the production runtime image, but they should not remain indefinitely.

Recommended follow-up:

- Upgrade or replace the parent build tools that retain these versions.
- Continue scanning both the production and full development dependency graphs in CI.

### 8. Secret history and lifecycle hygiene — Low priority

An obsolete local development TLS private key exists in repository history. It was not identified as a production credential, but committing private key material—even for local use—creates poor precedent and can trigger scanner noise.

Recommended follow-up:

- Keep generated local certificates outside Git and document reproducible local generation.
- Consider history cleanup only as a separately planned, coordinated operation; it rewrites commit history and is not required to protect production if the key was never trusted there.

## Verification evidence

At audit completion:

- Frontend security tests: 14 passing.
- Backend security/regression tests: 20 passing.
- Monorepo lint/type checks: passing, with only pre-existing non-blocking warnings.
- Full production build: passing, including all 101 frontend routes.
- Runtime checks: security headers present; cross-origin unsafe request rejected with 403.
- PDF.js, image/XML/storage dependency smoke checks: passing.
- Production dependency advisory scan: no known runtime advisories; development-only residuals documented above.

## Incident-response note

If there is evidence of actual intrusion, stop treating this solely as a code-hardening task. Preserve logs, restrict access, rotate affected credentials, identify the scope of accessed or altered data, restore from known-good sources when needed, and obtain qualified incident-response and legal/privacy advice appropriate to the affected users and jurisdictions.
