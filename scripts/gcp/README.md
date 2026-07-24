# Treeschool GCP backend

The production backend runs in `asia-northeast3` (Seoul), alongside the Supabase primary database region (`ap-northeast-2`).

## Services

- `treeschool-api`: scale-to-zero Cloud Run HTTP service.
- `treeschool-processor`: bounded Cloud Run Job that drains document and weekly-plan work.
- `treeschool-private-assets`: private GCS bucket for source and generated files.
- `treeschool`: Artifact Registry Docker repository.

## Bootstrap

```sh
bash scripts/gcp/setup.sh
```

Create these Secret Manager secrets before deployment:

- `DATABASE_URL` (use the Supabase transaction-pooler connection string for short-lived jobs)
- `GOOGLE_AI_API_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `INTERNAL_API_SECRET`

Optional:

- `ADMIN_ALERT_WEBHOOK_URL` — a private webhook that receives permanent processing-failure alerts.

Then deploy:

```sh
bash scripts/gcp/deploy.sh
```

The API starts the processor immediately after plan-pack uploads and authenticated lesson-plan generation requests. Cloud Scheduler is a recovery mechanism and invokes the job every five minutes through the Cloud Run v2 Jobs API, so queued work recovers automatically if an immediate dispatch is ever interrupted. Set `GCP_SCHEDULER_SCHEDULE` during deployment to override that interval.

Weekly planning has two worker phases: metadata planning, followed by metadata quality control. The quality phase verifies scheduling, source-page references, day coverage, duplicates, prerequisites, and excluded content before activating the plan. Interrupted or retry-delayed work resumes through the five-minute recovery invocation.

The frontend deployment needs these server-only environment variables:

- `INTERNAL_BACKEND_URL=https://treeschool-api-635939195300.asia-northeast3.run.app`
- `INTERNAL_API_SECRET` set to the same Secret Manager value used by the API

Large curriculum files upload directly from the browser to short-lived signed GCS URLs. They do not pass through Vercel or the Cloud Run API.

For authentication email, Stripe webhook, failure retry, and launch rehearsal steps, see `scripts/launch/README.md`.
