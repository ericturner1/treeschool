# Treeschool Quick Production Deploy Prompt

Copy everything below the divider into a new Codex task whenever you want the current work placed on production for testing.

---

Deploy the current intended changes in `/Users/eric/Documents/TreeSchool/treeschool` to production so I can test them.

Keep this practical and reasonably quick:

1. Read `agents.md`, inspect `git status` and the full diff, and identify the changes we intentionally made. Preserve all user-owned worktree changes. Do not include unexplained files, secrets, environment files, `pnpm-lock.yaml`, or `pnpm-workspace.yaml`.
2. Run `git diff --check`, the relevant targeted tests, and builds/type checks for the packages affected by this release. Do not run unrelated suites merely for ceremony. If a required check fails, fix it or stop and tell me.
3. Review any pending Supabase migrations. If they are additive or safe bounded backfills, apply them to the linked production project in timestamp order and verify they were recorded. Never reset production or run a destructive migration without asking me.
4. Commit the intended files and push `main` to `origin/main` normally. Never force-push or discard existing work.
5. Deploy only what changed:
   - Backend or worker changed: run `bash scripts/gcp/deploy.sh` and wait for `treeschool-api` and `treeschool-processor` to become ready.
   - Frontend changed: monitor the Vercel production deployment triggered by the push. Start a Vercel CLI production deploy only if Git integration did not start one.
   - Database only changed: do not redeploy unaffected services unless the application release depends on the schema change.
6. Confirm `https://www.treehomeschool.com` is serving the new frontend when applicable, the API is healthy, and the specific pages/features changed in this release load without new errors.
7. Do not use Gajou’s or another real family’s account for write-based testing. Do not trigger a replan, modify attendance or grades, award/use points, or complete a purchase on a real account. I will perform the real-account feature verification myself.

Current production is Vercel frontend + GCP Cloud Run backend/processor + linked Supabase. Do not use the legacy Docker Compose path in `docs/deployment.md`.

Stop and ask me only if the production target is unclear, Git has unexpectedly diverged, a migration is destructive or unsafe, tests/builds fail, credentials/permissions block deployment, or the rollout is unhealthy.

When finished, give me a short report with the deployed commit, migrations applied, service/deployment status, checks run, and the production URL/features ready for me to verify. Do not claim success until every changed surface is live and healthy.
