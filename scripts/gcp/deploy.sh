#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${GCP_PROJECT_ID:-treeschool}"
REGION="${GCP_REGION:-asia-northeast3}"
REPOSITORY="${GCP_ARTIFACT_REPOSITORY:-treeschool}"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/backend:$(git rev-parse --short HEAD 2>/dev/null || echo local)-$(date +%Y%m%d%H%M%S)"
API_SERVICE="${GCP_API_SERVICE:-treeschool-api}"
PROCESSOR_JOB="${GCP_PROCESSOR_JOB_NAME:-treeschool-processor}"
BUCKET="${GCS_BUCKET_NAME:-treeschool-private-assets}"

API_SECRETS="DATABASE_URL=DATABASE_URL:latest,GOOGLE_AI_API_KEY=GOOGLE_AI_API_KEY:latest,STRIPE_SECRET_KEY=STRIPE_SECRET_KEY:latest,STRIPE_WEBHOOK_SECRET=STRIPE_WEBHOOK_SECRET:latest,INTERNAL_API_SECRET=INTERNAL_API_SECRET:latest"
PROCESSOR_SECRETS="DATABASE_URL=DATABASE_URL:latest,GOOGLE_AI_API_KEY=GOOGLE_AI_API_KEY:latest"
if gcloud secrets describe ADMIN_ALERT_WEBHOOK_URL --project "${PROJECT_ID}" >/dev/null 2>&1; then
  API_SECRETS="${API_SECRETS},ADMIN_ALERT_WEBHOOK_URL=ADMIN_ALERT_WEBHOOK_URL:latest"
  PROCESSOR_SECRETS="${PROCESSOR_SECRETS},ADMIN_ALERT_WEBHOOK_URL=ADMIN_ALERT_WEBHOOK_URL:latest"
fi
if gcloud secrets describe SMTP_PASSWORD --project "${PROJECT_ID}" >/dev/null 2>&1; then
  API_SECRETS="${API_SECRETS},SMTP_PASSWORD=SMTP_PASSWORD:latest"
fi

gcloud builds submit \
  --project "${PROJECT_ID}" \
  --config cloudbuild.backend.yaml \
  --substitutions "_IMAGE=${IMAGE}" \
  .

gcloud run jobs deploy "${PROCESSOR_JOB}" \
  --project "${PROJECT_ID}" \
  --region "${REGION}" \
  --image "${IMAGE}" \
  --service-account "treeschool-processor@${PROJECT_ID}.iam.gserviceaccount.com" \
  --command bun \
  --args run,--filter,ts-backend,task-worker:start \
  --cpu 1 \
  --memory 2Gi \
  --task-timeout 60m \
  --max-retries 1 \
  --set-env-vars "GCP_PROJECT_ID=${PROJECT_ID},GCP_REGION=${REGION},GCP_PROCESSOR_JOB_NAME=${PROCESSOR_JOB},GCS_BUCKET_NAME=${BUCKET},PROCESSOR_MAX_JOBS=25,PROCESSOR_MAX_RUNTIME_SECONDS=3300" \
  --set-secrets "${PROCESSOR_SECRETS}" \
  --quiet

gcloud run deploy "${API_SERVICE}" \
  --project "${PROJECT_ID}" \
  --region "${REGION}" \
  --image "${IMAGE}" \
  --service-account "treeschool-api@${PROJECT_ID}.iam.gserviceaccount.com" \
  --allow-unauthenticated \
  --port 8080 \
  --cpu 1 \
  --memory 512Mi \
  --min-instances 0 \
  --max-instances 3 \
  --concurrency 40 \
  --timeout 300 \
  --set-env-vars "GCP_PROJECT_ID=${PROJECT_ID},GCP_REGION=${REGION},GCP_PROCESSOR_JOB_NAME=${PROCESSOR_JOB},GCS_BUCKET_NAME=${BUCKET},PUBLIC_APP_URL=https://www.treehomeschool.com,SMTP_HOST=mail.privateemail.com,SMTP_PORT=465,SMTP_SECURE=true,SMTP_USER=support@treehomeschool.com,SMTP_FROM=Treeschool Support <support@treehomeschool.com>" \
  --set-secrets "${API_SECRETS}" \
  --quiet

gcloud run jobs add-iam-policy-binding "${PROCESSOR_JOB}" \
  --project "${PROJECT_ID}" \
  --region "${REGION}" \
  --member "serviceAccount:treeschool-api@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role roles/run.invoker >/dev/null

SCHEDULER_JOB="${GCP_SCHEDULER_JOB:-treeschool-processor-recovery}"
SCHEDULER_SCHEDULE="${GCP_SCHEDULER_SCHEDULE:-*/5 * * * *}"
SCHEDULER_URI="https://run.googleapis.com/v2/projects/${PROJECT_ID}/locations/${REGION}/jobs/${PROCESSOR_JOB}:run"
if gcloud scheduler jobs describe "${SCHEDULER_JOB}" --project "${PROJECT_ID}" --location "${REGION}" >/dev/null 2>&1; then
  gcloud scheduler jobs update http "${SCHEDULER_JOB}" \
    --project "${PROJECT_ID}" --location "${REGION}" --schedule "${SCHEDULER_SCHEDULE}" --time-zone UTC \
    --uri "${SCHEDULER_URI}" --http-method POST \
    --oauth-service-account-email "treeschool-scheduler@${PROJECT_ID}.iam.gserviceaccount.com" \
    --oauth-token-scope https://www.googleapis.com/auth/cloud-platform --message-body '{}' >/dev/null
else
  gcloud scheduler jobs create http "${SCHEDULER_JOB}" \
    --project "${PROJECT_ID}" --location "${REGION}" --schedule "${SCHEDULER_SCHEDULE}" --time-zone UTC \
    --uri "${SCHEDULER_URI}" --http-method POST \
    --oauth-service-account-email "treeschool-scheduler@${PROJECT_ID}.iam.gserviceaccount.com" \
    --oauth-token-scope https://www.googleapis.com/auth/cloud-platform --message-body '{}' >/dev/null
fi

gcloud run jobs add-iam-policy-binding "${PROCESSOR_JOB}" \
  --project "${PROJECT_ID}" \
  --region "${REGION}" \
  --member "serviceAccount:treeschool-scheduler@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role roles/run.invoker >/dev/null

echo "Deployed ${API_SERVICE} and ${PROCESSOR_JOB} using ${IMAGE}."
