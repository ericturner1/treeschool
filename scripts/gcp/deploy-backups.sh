#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_ID="${GCP_PROJECT_ID:-treeschool}"
PROJECT_NUMBER="$(gcloud projects describe "${PROJECT_ID}" --format='value(projectNumber)')"
REGION="${GCP_REGION:-asia-northeast3}"
REPOSITORY="${GCP_ARTIFACT_REPOSITORY:-treeschool}"
BACKUP_PROJECT_ID="${GCP_BACKUP_PROJECT_ID:-treeschool-backups-${PROJECT_NUMBER:0:6}}"
BACKUP_BUCKET="${GCS_BACKUP_BUCKET:-treeschool-backups-${PROJECT_NUMBER}}"
BACKUP_JOB="${GCP_BACKUP_JOB:-treeschool-database-backup}"
BACKUP_SCHEDULER_JOB="${GCP_BACKUP_SCHEDULER_JOB:-treeschool-database-backup-nightly}"
BACKUP_SCHEDULE="${GCP_BACKUP_SCHEDULE:-30 2 * * *}"
BACKUP_TIME_ZONE="${GCP_BACKUP_TIME_ZONE:-Asia/Tokyo}"
BACKUP_SERVICE_ACCOUNT="treeschool-backup@${PROJECT_ID}.iam.gserviceaccount.com"
SCHEDULER_SERVICE_ACCOUNT="treeschool-scheduler@${PROJECT_ID}.iam.gserviceaccount.com"
API_SERVICE_ACCOUNT="treeschool-api@${PROJECT_ID}.iam.gserviceaccount.com"
GIT_REVISION="$(git rev-parse --short HEAD 2>/dev/null || echo local)"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/backup:${GIT_REVISION}-$(date +%Y%m%d%H%M%S)"

gcloud builds submit \
  --project="${PROJECT_ID}" \
  --config=cloudbuild.backup.yaml \
  --substitutions="_IMAGE=${IMAGE}" \
  .

BACKUP_SECRETS="DATABASE_URL=BACKUP_DATABASE_URL:latest,BACKUP_AGE_RECIPIENT=BACKUP_AGE_RECIPIENT:latest"
if gcloud secrets describe ADMIN_ALERT_WEBHOOK_URL --project="${PROJECT_ID}" >/dev/null 2>&1; then
  BACKUP_SECRETS="${BACKUP_SECRETS},ADMIN_ALERT_WEBHOOK_URL=ADMIN_ALERT_WEBHOOK_URL:latest"
fi

gcloud run jobs deploy "${BACKUP_JOB}" \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --image="${IMAGE}" \
  --service-account="${BACKUP_SERVICE_ACCOUNT}" \
  --cpu=1 \
  --memory=1Gi \
  --task-timeout=60m \
  --max-retries=1 \
  --set-env-vars="BACKUP_BUCKET=gs://${BACKUP_BUCKET},BACKUP_SOURCE=treeschool-production,APP_GIT_REVISION=${GIT_REVISION}" \
  --set-secrets="${BACKUP_SECRETS}" \
  --quiet

SCHEDULER_URI="https://run.googleapis.com/v2/projects/${PROJECT_ID}/locations/${REGION}/jobs/${BACKUP_JOB}:run"
if gcloud scheduler jobs describe "${BACKUP_SCHEDULER_JOB}" --project="${PROJECT_ID}" --location="${REGION}" >/dev/null 2>&1; then
  gcloud scheduler jobs update http "${BACKUP_SCHEDULER_JOB}" \
    --project="${PROJECT_ID}" \
    --location="${REGION}" \
    --schedule="${BACKUP_SCHEDULE}" \
    --time-zone="${BACKUP_TIME_ZONE}" \
    --uri="${SCHEDULER_URI}" \
    --http-method=POST \
    --oauth-service-account-email="${SCHEDULER_SERVICE_ACCOUNT}" \
    --oauth-token-scope=https://www.googleapis.com/auth/cloud-platform \
    --message-body='{}' >/dev/null
else
  gcloud scheduler jobs create http "${BACKUP_SCHEDULER_JOB}" \
    --project="${PROJECT_ID}" \
    --location="${REGION}" \
    --schedule="${BACKUP_SCHEDULE}" \
    --time-zone="${BACKUP_TIME_ZONE}" \
    --uri="${SCHEDULER_URI}" \
    --http-method=POST \
    --oauth-service-account-email="${SCHEDULER_SERVICE_ACCOUNT}" \
    --oauth-token-scope=https://www.googleapis.com/auth/cloud-platform \
    --message-body='{}' >/dev/null
fi

gcloud run jobs add-iam-policy-binding "${BACKUP_JOB}" \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --member="serviceAccount:${SCHEDULER_SERVICE_ACCOUNT}" \
  --role=roles/run.invoker >/dev/null

gcloud run jobs add-iam-policy-binding "${BACKUP_JOB}" \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --member="serviceAccount:${API_SERVICE_ACCOUNT}" \
  --role=roles/run.invoker >/dev/null

gcloud run jobs add-iam-policy-binding "${BACKUP_JOB}" \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --member="serviceAccount:${API_SERVICE_ACCOUNT}" \
  --role=roles/run.viewer >/dev/null

echo "Deployed ${BACKUP_JOB} using ${IMAGE}."
echo "Nightly schedule: ${BACKUP_SCHEDULE} (${BACKUP_TIME_ZONE})."
echo "Destination: gs://${BACKUP_BUCKET} in ${BACKUP_PROJECT_ID}."
