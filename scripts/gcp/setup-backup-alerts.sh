#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_ID="${GCP_PROJECT_ID:-treeschool}"
BACKUP_JOB="${GCP_BACKUP_JOB:-treeschool-database-backup}"
ALERT_EMAIL="${GCP_BACKUP_ALERT_EMAIL:-ericsturner1@gmail.com}"
METRIC_NAME="treeschool_database_backup_failures"
POLICY_DISPLAY_NAME="Treeschool production database backup failed"

gcloud services enable \
  logging.googleapis.com \
  monitoring.googleapis.com \
  --project="${PROJECT_ID}" >/dev/null

LOG_FILTER="resource.type=\"cloud_run_job\" AND resource.labels.job_name=\"${BACKUP_JOB}\" AND log_id(\"cloudaudit.googleapis.com/system_event\") AND protoPayload.status.code=10"
if gcloud logging metrics describe "${METRIC_NAME}" --project="${PROJECT_ID}" >/dev/null 2>&1; then
  gcloud logging metrics update "${METRIC_NAME}" \
    --project="${PROJECT_ID}" \
    --description="Counts failed Treeschool production database backup executions." \
    --log-filter="${LOG_FILTER}" >/dev/null
else
  gcloud logging metrics create "${METRIC_NAME}" \
    --project="${PROJECT_ID}" \
    --description="Counts failed Treeschool production database backup executions." \
    --log-filter="${LOG_FILTER}" >/dev/null
fi

ACCESS_TOKEN="$(gcloud auth print-access-token)"
CHANNELS_JSON="$(curl --fail --silent --show-error \
  --header "Authorization: Bearer ${ACCESS_TOKEN}" \
  "https://monitoring.googleapis.com/v3/projects/${PROJECT_ID}/notificationChannels")"
CHANNEL_NAME="$(jq -r \
  --arg email "${ALERT_EMAIL}" \
  'first(.notificationChannels[]? | select(.type == "email" and .labels.email_address == $email) | .name) // empty' \
  <<< "${CHANNELS_JSON}")"

if [[ -z "${CHANNEL_NAME}" ]]; then
  CHANNEL_PAYLOAD="$(jq -cn \
    --arg email "${ALERT_EMAIL}" \
    '{type: "email", displayName: "Treeschool operations email", labels: {email_address: $email}, enabled: true}')"
  CHANNEL_NAME="$(curl --fail --silent --show-error \
    --request POST \
    --header "Authorization: Bearer ${ACCESS_TOKEN}" \
    --header 'Content-Type: application/json' \
    --data "${CHANNEL_PAYLOAD}" \
    "https://monitoring.googleapis.com/v3/projects/${PROJECT_ID}/notificationChannels" \
    | jq -er '.name')"
fi

POLICIES_JSON="$(curl --fail --silent --show-error \
  --header "Authorization: Bearer ${ACCESS_TOKEN}" \
  "https://monitoring.googleapis.com/v3/projects/${PROJECT_ID}/alertPolicies")"
POLICY_NAME="$(jq -r \
  --arg displayName "${POLICY_DISPLAY_NAME}" \
  'first(.alertPolicies[]? | select(.displayName == $displayName) | .name) // empty' \
  <<< "${POLICIES_JSON}")"

if [[ -z "${POLICY_NAME}" ]]; then
  POLICY_PAYLOAD="$(jq -cn \
    --arg channel "${CHANNEL_NAME}" \
    --arg job "${BACKUP_JOB}" \
    --arg metric "logging.googleapis.com/user/${METRIC_NAME}" \
    --arg displayName "${POLICY_DISPLAY_NAME}" \
    '{
      displayName: $displayName,
      combiner: "OR",
      enabled: true,
      notificationChannels: [$channel],
      documentation: {
        mimeType: "text/markdown",
        subject: $displayName,
        content: "The nightly Cloud Run database backup job failed. Inspect the backup job, correct the cause, rerun it manually, and verify that a new encrypted object exists in the isolated backup bucket."
      },
      alertStrategy: {autoClose: "86400s", notificationPrompts: ["OPENED"]},
      conditions: [{
        displayName: "At least one failed backup execution",
        conditionThreshold: {
          filter: ("resource.type = \\"cloud_run_job\\" AND resource.labels.job_name = \\"" + $job + "\\" AND metric.type = \\"" + $metric + "\\""),
          comparison: "COMPARISON_GT",
          thresholdValue: 0,
          duration: "0s",
          aggregations: [{alignmentPeriod: "60s", perSeriesAligner: "ALIGN_DELTA"}],
          trigger: {count: 1}
        }
      }]
    }')"
  POLICY_NAME="$(curl --fail --silent --show-error \
    --request POST \
    --header "Authorization: Bearer ${ACCESS_TOKEN}" \
    --header 'Content-Type: application/json' \
    --data "${POLICY_PAYLOAD}" \
    "https://monitoring.googleapis.com/v3/projects/${PROJECT_ID}/alertPolicies" \
    | jq -er '.name')"
fi

unset ACCESS_TOKEN CHANNELS_JSON POLICIES_JSON
echo "Backup failure alerts are ready for ${ALERT_EMAIL}."
echo "Alert policy: ${POLICY_NAME}"
