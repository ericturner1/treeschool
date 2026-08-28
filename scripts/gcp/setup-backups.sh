#!/usr/bin/env bash
set -Eeuo pipefail

SOURCE_PROJECT_ID="${GCP_PROJECT_ID:-treeschool}"
SOURCE_PROJECT_NUMBER="$(gcloud projects describe "${SOURCE_PROJECT_ID}" --format='value(projectNumber)')"
BACKUP_PROJECT_ID="${GCP_BACKUP_PROJECT_ID:-treeschool-backups-${SOURCE_PROJECT_NUMBER:0:6}}"
BACKUP_BUCKET="${GCS_BACKUP_BUCKET:-treeschool-backups-${SOURCE_PROJECT_NUMBER}}"
BACKUP_LOCATION="${GCS_BACKUP_LOCATION:-asia-northeast1}"
BACKUP_SERVICE_ACCOUNT="treeschool-backup@${SOURCE_PROJECT_ID}.iam.gserviceaccount.com"
BACKUP_ROLE_SECRET="BACKUP_DATABASE_URL"
BACKUP_RECIPIENT_SECRET="BACKUP_AGE_RECIPIENT"
BACKUP_PRIVATE_KEY_SECRET="treeschool-backup-age-private-key"
LIFECYCLE_FILE="scripts/gcp/backup-storage-lifecycle.json"

if [[ ! -f "${LIFECYCLE_FILE}" ]]; then
  echo "Run this script from the Treeschool repository root." >&2
  exit 1
fi
if ! command -v age-keygen >/dev/null 2>&1; then
  echo "age-keygen is required. On macOS, install it with: brew install age" >&2
  exit 1
fi

if ! gcloud projects describe "${BACKUP_PROJECT_ID}" >/dev/null 2>&1; then
  gcloud projects create "${BACKUP_PROJECT_ID}" --name="Treeschool Backups"
fi

SOURCE_BILLING_ACCOUNT="$(gcloud billing projects describe "${SOURCE_PROJECT_ID}" --format='value(billingAccountName)' | sed 's#billingAccounts/##')"
if [[ -z "${SOURCE_BILLING_ACCOUNT}" ]]; then
  echo "The source project does not have an active billing account." >&2
  exit 1
fi
BACKUP_BILLING_ACCOUNT="$(gcloud billing projects describe "${BACKUP_PROJECT_ID}" --format='value(billingAccountName)' 2>/dev/null | sed 's#billingAccounts/##')"
if [[ "${BACKUP_BILLING_ACCOUNT}" != "${SOURCE_BILLING_ACCOUNT}" ]]; then
  gcloud billing projects link "${BACKUP_PROJECT_ID}" --billing-account="${SOURCE_BILLING_ACCOUNT}" >/dev/null
fi

gcloud services enable \
  iam.googleapis.com \
  secretmanager.googleapis.com \
  storage.googleapis.com \
  --project="${BACKUP_PROJECT_ID}"

if ! gcloud iam service-accounts describe "${BACKUP_SERVICE_ACCOUNT}" --project="${SOURCE_PROJECT_ID}" >/dev/null 2>&1; then
  gcloud iam service-accounts create treeschool-backup \
    --display-name="Treeschool immutable backup writer" \
    --project="${SOURCE_PROJECT_ID}"
fi

if ! gcloud storage buckets describe "gs://${BACKUP_BUCKET}" --project="${BACKUP_PROJECT_ID}" >/dev/null 2>&1; then
  gcloud storage buckets create "gs://${BACKUP_BUCKET}" \
    --project="${BACKUP_PROJECT_ID}" \
    --location="${BACKUP_LOCATION}" \
    --uniform-bucket-level-access \
    --public-access-prevention \
    --soft-delete-duration=30d \
    --retention-period=100d
fi
gcloud storage buckets update "gs://${BACKUP_BUCKET}" \
  --project="${BACKUP_PROJECT_ID}" \
  --public-access-prevention \
  --soft-delete-duration=30d \
  --retention-period=100d \
  --lifecycle-file="${LIFECYCLE_FILE}" >/dev/null

for role in roles/storage.objectCreator roles/storage.objectViewer; do
  gcloud storage buckets add-iam-policy-binding "gs://${BACKUP_BUCKET}" \
    --project="${BACKUP_PROJECT_ID}" \
    --member="serviceAccount:${BACKUP_SERVICE_ACCOUNT}" \
    --role="${role}" >/dev/null
done

DATABASE_URL="$(gcloud secrets versions access latest --secret=DATABASE_URL --project="${SOURCE_PROJECT_ID}")"
if gcloud secrets describe "${BACKUP_ROLE_SECRET}" --project="${SOURCE_PROJECT_ID}" >/dev/null 2>&1; then
  BACKUP_DATABASE_URL="$(gcloud secrets versions access latest --secret="${BACKUP_ROLE_SECRET}" --project="${SOURCE_PROJECT_ID}")"
  if [[ "${BACKUP_DATABASE_URL}" != "${DATABASE_URL}" ]]; then
    printf '%s' "${DATABASE_URL}" | gcloud secrets versions add "${BACKUP_ROLE_SECRET}" \
      --project="${SOURCE_PROJECT_ID}" \
      --data-file=- >/dev/null
  fi
else
  BACKUP_DATABASE_URL="${DATABASE_URL}"
  printf '%s' "${BACKUP_DATABASE_URL}" | gcloud secrets create "${BACKUP_ROLE_SECRET}" \
    --project="${SOURCE_PROJECT_ID}" \
    --replication-policy=automatic \
    --data-file=- >/dev/null
fi
unset DATABASE_URL BACKUP_DATABASE_URL

KEY_FILE="$(mktemp)"
trap 'rm -f "${KEY_FILE}"' EXIT
if gcloud secrets describe "${BACKUP_PRIVATE_KEY_SECRET}" --project="${BACKUP_PROJECT_ID}" >/dev/null 2>&1; then
  gcloud secrets versions access latest \
    --secret="${BACKUP_PRIVATE_KEY_SECRET}" \
    --project="${BACKUP_PROJECT_ID}" \
    > "${KEY_FILE}"
else
  age-keygen > "${KEY_FILE}" 2>/dev/null
  gcloud secrets create "${BACKUP_PRIVATE_KEY_SECRET}" \
    --project="${BACKUP_PROJECT_ID}" \
    --replication-policy=automatic \
    --data-file="${KEY_FILE}" >/dev/null
fi
BACKUP_AGE_RECIPIENT="$(age-keygen -y "${KEY_FILE}")"

if gcloud secrets describe "${BACKUP_RECIPIENT_SECRET}" --project="${SOURCE_PROJECT_ID}" >/dev/null 2>&1; then
  CURRENT_BACKUP_AGE_RECIPIENT="$(gcloud secrets versions access latest \
    --secret="${BACKUP_RECIPIENT_SECRET}" \
    --project="${SOURCE_PROJECT_ID}")"
  if [[ "${CURRENT_BACKUP_AGE_RECIPIENT}" != "${BACKUP_AGE_RECIPIENT}" ]]; then
    printf '%s' "${BACKUP_AGE_RECIPIENT}" | gcloud secrets versions add "${BACKUP_RECIPIENT_SECRET}" \
      --project="${SOURCE_PROJECT_ID}" \
      --data-file=- >/dev/null
  fi
else
  printf '%s' "${BACKUP_AGE_RECIPIENT}" | gcloud secrets create "${BACKUP_RECIPIENT_SECRET}" \
    --project="${SOURCE_PROJECT_ID}" \
    --replication-policy=automatic \
    --data-file=- >/dev/null
fi
unset BACKUP_AGE_RECIPIENT CURRENT_BACKUP_AGE_RECIPIENT

for secret in "${BACKUP_ROLE_SECRET}" "${BACKUP_RECIPIENT_SECRET}"; do
  gcloud secrets add-iam-policy-binding "${secret}" \
    --project="${SOURCE_PROJECT_ID}" \
    --member="serviceAccount:${BACKUP_SERVICE_ACCOUNT}" \
    --role=roles/secretmanager.secretAccessor >/dev/null
done
if gcloud secrets describe ADMIN_ALERT_WEBHOOK_URL --project="${SOURCE_PROJECT_ID}" >/dev/null 2>&1; then
  gcloud secrets add-iam-policy-binding ADMIN_ALERT_WEBHOOK_URL \
    --project="${SOURCE_PROJECT_ID}" \
    --member="serviceAccount:${BACKUP_SERVICE_ACCOUNT}" \
    --role=roles/secretmanager.secretAccessor >/dev/null
fi

bash scripts/gcp/setup-backup-alerts.sh

echo "Backup infrastructure is ready."
echo "Source project: ${SOURCE_PROJECT_ID}"
echo "Backup project: ${BACKUP_PROJECT_ID}"
echo "Backup bucket: gs://${BACKUP_BUCKET}"
echo "The age private key is stored only in ${BACKUP_PROJECT_ID}/${BACKUP_PRIVATE_KEY_SECRET}."
