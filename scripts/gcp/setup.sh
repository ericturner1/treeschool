#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${GCP_PROJECT_ID:-treeschool}"
REGION="${GCP_REGION:-asia-northeast3}"
REPOSITORY="${GCP_ARTIFACT_REPOSITORY:-treeschool}"
BUCKET="${GCS_BUCKET_NAME:-treeschool-private-assets}"

gcloud config set project "${PROJECT_ID}"
gcloud config set run/region "${REGION}"

gcloud services enable \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  cloudscheduler.googleapis.com \
  iamcredentials.googleapis.com \
  run.googleapis.com \
  secretmanager.googleapis.com \
  storage.googleapis.com \
  --project "${PROJECT_ID}"

if ! gcloud artifacts repositories describe "${REPOSITORY}" --location "${REGION}" --project "${PROJECT_ID}" >/dev/null 2>&1; then
  gcloud artifacts repositories create "${REPOSITORY}" \
    --repository-format docker \
    --location "${REGION}" \
    --description "Treeschool application containers" \
    --project "${PROJECT_ID}"
fi

for account in api processor scheduler; do
  service_account="treeschool-${account}"
  if ! gcloud iam service-accounts describe "${service_account}@${PROJECT_ID}.iam.gserviceaccount.com" --project "${PROJECT_ID}" >/dev/null 2>&1; then
    gcloud iam service-accounts create "${service_account}" \
      --display-name "Treeschool ${account}" \
      --project "${PROJECT_ID}"
  fi
done

if ! gcloud storage buckets describe "gs://${BUCKET}" --project "${PROJECT_ID}" >/dev/null 2>&1; then
  gcloud storage buckets create "gs://${BUCKET}" \
    --project "${PROJECT_ID}" \
    --location "${REGION}" \
    --uniform-bucket-level-access
fi

gcloud storage buckets update "gs://${BUCKET}" --public-access-prevention
gcloud storage buckets update "gs://${BUCKET}" --cors-file scripts/gcp/storage-cors.json

for account in api processor; do
  member="serviceAccount:treeschool-${account}@${PROJECT_ID}.iam.gserviceaccount.com"
  gcloud storage buckets add-iam-policy-binding "gs://${BUCKET}" \
    --member "${member}" \
    --role roles/storage.objectAdmin >/dev/null
  gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
    --member "${member}" \
    --role roles/secretmanager.secretAccessor >/dev/null
done

gcloud iam service-accounts add-iam-policy-binding \
  "treeschool-api@${PROJECT_ID}.iam.gserviceaccount.com" \
  --project "${PROJECT_ID}" \
  --member "serviceAccount:treeschool-api@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role roles/iam.serviceAccountTokenCreator >/dev/null

echo "GCP base infrastructure is ready in ${PROJECT_ID}/${REGION}."
