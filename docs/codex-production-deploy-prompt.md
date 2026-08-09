# Treeschool Production Deployment Prompt

This is the high-assurance prompt for major or high-risk releases. For ordinary deployments, use [`codex-production-deploy-prompt-light.md`](./codex-production-deploy-prompt-light.md).

Copy everything below the divider into a new Codex task when you want to deploy Treeschool to production.

---

You are preparing and executing a production deployment of the Treeschool monorepo at `/Users/eric/Documents/TreeSchool/treeschool`.

This is a real production system used daily for my children’s homeschooling. My son Gajou has an active learning year in progress. Protect all existing production accounts, students, learning years, weekly plans, attendance, grades, workbook progress, downloads, points, purchases, and billing records. Do not use Gajou or another real family as a write-test account.

Your job is to deploy the already-implemented changes safely. Do not develop unrelated features or refactor unrelated code during this task.

## Known production topology

Verify these facts from the current repository and configured CLIs before acting; do not rely on them blindly:

- Repository: `ericturner1/treeschool`
- Production branch: `main`
- Production web app: Vercel project `treeschool-ts-frontend`
- Production domain: `https://www.treehomeschool.com`
- Backend: GCP project `treeschool`, Cloud Run region `asia-northeast3`
- API service: `treeschool-api`
- Processor job: `treeschool-processor`
- Database/auth: the linked production Supabase project
- Private workbook/plan assets: GCS bucket `treeschool-private-assets`

Important: `docs/deployment.md` describes an older Docker/GitHub-branch deployment path. The current `.github/workflows/deploy.yml` only performs CI. The current backend deployment is defined by `scripts/gcp/deploy.sh`; the frontend is Vercel-hosted. Inspect the live configuration and use the active paths. Do not accidentally deploy the legacy Docker Compose stack.

## Non-negotiable safety rules

1. Read `agents.md`, `docs/deployment.md`, `scripts/gcp/README.md`, `scripts/gcp/deploy.sh`, `cloudbuild.backend.yaml`, `Dockerfile.backend`, the Vercel project link, and every pending Supabase migration before deployment.
2. Never print, paste, commit, summarize, or expose environment files, database URLs, access tokens, service-account JSON, Stripe secrets, Supabase keys, or secret values. It is fine to confirm that a named secret exists.
3. Never run destructive Git or database commands. Do not reset, discard, overwrite, truncate, or delete production data. Never run a database reset against the linked project.
4. Preserve all pre-existing worktree changes. Explicitly identify which files belong to this release. Do not include unrelated or unexplained files. In particular, do not stage `pnpm-lock.yaml` or `pnpm-workspace.yaml` unless I separately confirm they are intentional.
5. Do not rewrite already-applied migrations. New schema changes must be new forward migrations.
6. Do not silently bypass failed tests, migration warnings, permission failures, or health checks.
7. Do not use a real child/account for mutation-based smoke tests. Use read-only checks or a controlled test account.
8. Stop before any action whose target is ambiguous. Confirm that every CLI is pointed at the expected production project, not a local, staging, or unrelated project.

## Phase 1 — Inspect and produce a deployment manifest

Before mutating anything:

1. Inspect the branch, `git status`, staged/unstaged/untracked files, recent commits, `origin/main`, and the full diff.
2. Fetch remote refs without merging. Explain whether local `main` is ahead of, behind, or diverged from `origin/main`.
3. Identify the exact release scope:
   - commits not yet on `origin/main`;
   - intentional uncommitted source changes;
   - new migrations;
   - dependency/runtime changes;
   - frontend-only, backend-only, worker, and database effects.
4. Inspect every pending migration line by line. Classify each as additive, backfill, constraint/index, destructive, or long-locking. Estimate the affected tables and whether old and new application versions can safely overlap during rollout.
5. Check the linked Supabase migration state using a read-only/list or dry-run command. Do not apply anything yet.
6. Confirm the active GCP project/region, current Cloud Run API revision, processor job image, linked Vercel project, current production deployment, and production aliases without changing them.
7. Confirm production database backup/PITR availability without downloading family data. If no credible restore point exists and a migration can modify existing rows, stop and ask me.
8. Give me a concise deployment manifest listing:
   - files/commits being released;
   - pending migrations in order;
   - expected data impact;
   - required deployment order;
   - verification plan;
   - rollback plan.

If I explicitly told you to execute the deployment in the same request, continue after the manifest unless a hard-stop condition is present. Otherwise, wait for my approval.

## Phase 2 — Preflight verification

Use Bun and the repository’s pinned dependencies. At minimum:

1. Run `git diff --check`.
2. Run the repository lint/type checks.
3. Run the full production build for `ts-db`, `ts-backend`, and `ts-frontend`.
4. Run all relevant tests for the changed areas. If lesson-plan generator code changed, run `bun run verify:plan-generators`. If workbook scheduling/release code changed, run its targeted backend tests. If purchase/revenue code changed, run the relevant revenue tests in a non-purchasing mode.
5. Confirm the backend Docker image can include every new runtime asset and dependency, especially Playwright/Chromium, fonts, Paged.js, PDF tools, and Workbook Studio assets when those areas changed.
6. Review the final diff again after tests. Test/build artifacts must not be committed.

If any required check fails, diagnose it. Do not deploy until it passes or I explicitly accept a clearly described pre-existing warning that cannot affect this release.

## Phase 3 — Commit and publish the release source

1. Stage only the intentional release files with explicit paths.
2. Show the staged summary and verify that no secret, environment file, generated build output, local Supabase state, `.vercel` state, or unrelated package-manager file is included.
3. Create one or more clear commits without amending or rewriting unrelated history.
4. Verify the worktree is clean except for explicitly excluded user-owned files.
5. Push `main` to `origin/main` using a normal non-force push.
6. Record the exact commit SHA used for deployment.

If `origin/main` advanced unexpectedly or the push is rejected, stop. Do not force-push or casually rebase shared production history.

## Phase 4 — Apply production migrations

1. Reconfirm the linked Supabase target and show only its non-secret project identity.
2. Use the Supabase migration mechanism, not ad hoc edits in the dashboard, so migration history remains accurate.
3. Apply only the reviewed pending migrations in timestamp order.
4. For migrations that backfill existing data, capture minimal aggregate counts before and after. Do not print student names, lesson contents, point reasons, email addresses, or other family data.
5. Verify each new table/column/constraint/index and confirm the migration ledger recorded it.
6. Never run `supabase db reset` or a destructive schema sync against production.

Deploy schema changes before application code that requires them. If a migration is not backward-compatible with the currently serving app, minimize the overlap window and explain the exact coordinated sequence before proceeding. If safe coordination is impossible, stop and revise the migration rather than gambling with production.

## Phase 5 — Deploy backend and processor

1. Deploy the committed SHA using the current GCP script: `bash scripts/gcp/deploy.sh`.
2. Watch Cloud Build through completion. Do not treat submission as success.
3. Confirm the new `treeschool-processor` job revision uses the expected image and becomes ready.
4. Confirm the new `treeschool-api` Cloud Run revision becomes ready and receives production traffic.
5. Verify the API service account, processor service account, secrets, environment variables, GCS bucket, scheduler invocation, and API-to-job invoker binding remain intact.
6. Check startup and error logs for the new revision. Look specifically for database schema errors, missing assets/fonts/browsers, authentication failures, storage failures, Stripe configuration errors, and worker dispatch failures.

Do not delete old Cloud Run revisions during this deployment; they are the fast rollback path.

## Phase 6 — Deploy frontend

1. Deploy the same committed SHA to the linked Vercel production project using the currently configured production workflow/CLI.
2. Do not expose environment variable values. Confirm required names exist, especially the production Supabase public settings, `INTERNAL_BACKEND_URL`, and `INTERNAL_API_SECRET`.
3. Wait until the Vercel deployment is `Ready` and confirm `www.treehomeschool.com` points to it.
4. Confirm frontend and backend correspond to the same release SHA or clearly document any unavoidable difference.

Avoid triggering duplicate competing Vercel deployments. If Git integration already started the production deployment after the push, monitor that deployment instead of launching another.

## Phase 7 — Production verification

Perform non-destructive checks first:

1. Load the production home, pricing, sign-in, dashboard shell, and a public workbook/bookstore page.
2. Confirm the frontend can reach the new API and that there are no new 5xx responses or obvious client errors.
3. Verify Supabase authentication configuration still points at the production domain.
4. Verify the processor recovery scheduler still exists and the job can be invoked. Do not enqueue fake work in a real student’s plan.
5. Check Cloud Run and Vercel logs for a short observation window after traffic shifts.
6. Run the existing non-purchasing production revenue smoke checks when purchase code changed. Never complete a real charge without separate authorization.
7. For student-plan changes, use read-only aggregate checks to confirm an existing in-progress learning year retains the same learning-year ID, preserved week IDs/statuses, attendance counts, grades, download records, workbook progress, and active plan version. Do not print private details and do not trigger a replan.
8. For points changes, inspect only a controlled test account or use read-only schema/API checks. Do not award or spend Gajou’s points as a test.

If a smoke test requires a write and no controlled test account exists, stop and ask me rather than using a real family account.

## Rollback rules

Before deploying, identify the exact prior healthy Vercel deployment and Cloud Run revision.

If the new release is unhealthy:

1. Stop further rollout and state the symptom and affected surface.
2. Route Cloud Run traffic back to the prior healthy revision.
3. Restore/promote the prior healthy Vercel deployment.
4. Do not automatically reverse a production migration or restore the entire database. Prefer a forward-compatible application rollback. Database restore or compensating migration requires explicit approval and a clear data-impact analysis.
5. Confirm recovery with the same smoke checks and report whether any requests or jobs occurred during the bad revision window.

## Hard-stop conditions

Stop and ask me before proceeding if any of these occur:

- target project/environment cannot be proven;
- production backup/PITR is unavailable for a material data migration;
- a migration drops, truncates, broadly rewrites, or ambiguously remaps family/student data;
- tests or production builds fail;
- unrelated or secret files appear in the release;
- `origin/main` diverged or changed unexpectedly;
- deployment requires force-push, destructive Git, credential extraction, or bypassing permissions;
- the new revision cannot coexist safely with the migration sequence;
- verification would require mutating a real child’s account;
- unexpected plan, attendance, grade, progress, points, purchase, or billing changes are detected.

## Final report

When complete, report:

- deployed commit SHA;
- migrations applied;
- Cloud Run API revision and processor image/job status;
- Vercel deployment/alias status;
- checks and tests run;
- production smoke-test results;
- confirmation that no real student data was intentionally mutated during verification;
- any warnings, excluded files, or follow-up work.

Do not say the deployment succeeded until migrations, backend, worker, frontend, aliases, and production smoke checks have all been verified.
