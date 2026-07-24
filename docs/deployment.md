# Deployment

Treeschool deploys from GitHub Actions by branch:

- `staging` deploys to the GitHub environment named `staging`.
- `main` deploys to the GitHub environment named `production`.

Each GitHub environment should contain its own Supabase, Stripe, storage, and host settings.

## Required GitHub Environment Secrets

Create these secrets in both `staging` and `production`:

- `DEPLOY_HOST`: SSH hostname or IP address for the deployment server.
- `DEPLOY_USER`: SSH user.
- `DEPLOY_SSH_KEY`: private SSH key that can log in as `DEPLOY_USER`.
- `BACKEND_ENV`: full contents of `app/ts-backend/.env` for this environment.
- `FRONTEND_ENV`: full contents of `app/ts-frontend/.env.local` for this environment.

`BACKEND_ENV` should include values such as:

```env
DATABASE_URL=postgresql://...
GOOGLE_AI_API_KEY=...
GCS_BUCKET_NAME=...
GOOGLE_APPLICATION_CREDENTIALS_JSON_B64=...
BILLING_GUARD_ENABLED=true
STRIPE_SECRET_KEY=...
STRIPE_WEBHOOK_SECRET=...
STRIPE_PLAN_PACK_PRICE_ID=...
STRIPE_MONTHLY_PRICE_ID=...
STRIPE_YEARLY_PRICE_ID=...
STRIPE_ADDITIONAL_STUDENT_MONTHLY_PRICE_ID=...
STRIPE_ADDITIONAL_STUDENT_YEARLY_PRICE_ID=...
MAINTENANCE_JOB_SECRET=...
```

`FRONTEND_ENV` should include values such as:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-environment-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
NEXT_PUBLIC_APP_URL=https://staging.treehomeschool.com
NEXT_PUBLIC_APP_HOST=staging.treehomeschool.com
INTERNAL_BACKEND_URL=http://ts-backend:3001
```

For production, use the production Supabase project URL/key and production app URL/host.

## Optional GitHub Environment Variables

Create these as GitHub environment variables when needed:

- `DEPLOY_PORT`: SSH port. Defaults to `22`.
- `DEPLOY_APP_DIR`: remote directory. Defaults to `/opt/treeschool-staging` or `/opt/treeschool-production`.
- `FRONTEND_PORT`: host port for the frontend container. Defaults to `3100`.
- `BACKEND_PORT`: host port for the backend container. Defaults to `3001`.
- `TASK_POLL_INTERVAL_MS`: task worker poll interval. Defaults to `5000`.
- `MAINTENANCE_INTERVAL_SECONDS`: maintenance job interval. Defaults to `300`.

If staging and production live on the same server, set different `FRONTEND_PORT` and `BACKEND_PORT` values for each environment, then point your reverse proxy domains to the matching frontend ports.

## Server Requirements

The deployment server needs:

- Docker and Docker Compose.
- SSH access from GitHub Actions.
- A reverse proxy or load balancer pointing the public domain to the configured frontend port.

The GitHub workflow uploads the repository bundle over SSH, writes the environment-specific env files, and runs:

```sh
docker compose --env-file .deploy.env -f docker/docker-compose.deploy.yml up -d --remove-orphans
```
