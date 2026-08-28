#!/usr/bin/env bash
set -Eeuo pipefail

if [[ $# -ne 2 ]]; then
  echo "Usage: $0 gs://bucket/path/to/backup.tar.zst.age /path/to/age-private-key" >&2
  exit 1
fi

BACKUP_OBJECT="$1"
AGE_PRIVATE_KEY="$2"
if [[ ! "${BACKUP_OBJECT}" =~ \.tar\.zst\.age$ ]]; then
  echo "The backup object must end in .tar.zst.age." >&2
  exit 1
fi
if [[ ! -s "${AGE_PRIVATE_KEY}" ]]; then
  echo "The age private-key file is missing or empty." >&2
  exit 1
fi

VERIFY_TEMP_DIR="$(mktemp -d)"
trap 'rm -rf "${VERIFY_TEMP_DIR}"' EXIT

MANIFEST_OBJECT="${BACKUP_OBJECT%.tar.zst.age}.manifest.json"
gcloud storage cp "${BACKUP_OBJECT}" "${VERIFY_TEMP_DIR}/database-backup.tar.zst.age"
gcloud storage cp "${MANIFEST_OBJECT}" "${VERIFY_TEMP_DIR}/manifest.json"

EXPECTED_SHA256="$(jq -er '.sha256' "${VERIFY_TEMP_DIR}/manifest.json")"
ACTUAL_SHA256="$(sha256sum "${VERIFY_TEMP_DIR}/database-backup.tar.zst.age" | cut -d' ' -f1)"
if [[ "${EXPECTED_SHA256}" != "${ACTUAL_SHA256}" ]]; then
  echo "Encrypted backup checksum mismatch." >&2
  exit 1
fi

age \
  --decrypt \
  --identity="${AGE_PRIVATE_KEY}" \
  --output="${VERIFY_TEMP_DIR}/database-backup.tar.zst" \
  "${VERIFY_TEMP_DIR}/database-backup.tar.zst.age"
zstd --quiet --test "${VERIFY_TEMP_DIR}/database-backup.tar.zst"
zstd --quiet --decompress \
  "${VERIFY_TEMP_DIR}/database-backup.tar.zst" \
  -o "${VERIFY_TEMP_DIR}/database-backup.tar"
tar --directory="${VERIFY_TEMP_DIR}" --extract --file="${VERIFY_TEMP_DIR}/database-backup.tar"

for required_file in roles.sql schema.sql data.sql migration-history.sql backup-metadata.json; do
  if [[ ! -s "${VERIFY_TEMP_DIR}/${required_file}" ]]; then
    echo "Verified archive is missing ${required_file}." >&2
    exit 1
  fi
done

for sql_file in roles.sql schema.sql data.sql migration-history.sql; do
  expected="$(jq -er --arg file "${sql_file}" '.files[$file].sha256' "${VERIFY_TEMP_DIR}/backup-metadata.json")"
  actual="$(sha256sum "${VERIFY_TEMP_DIR}/${sql_file}" | cut -d' ' -f1)"
  if [[ "${expected}" != "${actual}" ]]; then
    echo "Archive checksum mismatch for ${sql_file}." >&2
    exit 1
  fi
done

for required_table in \
  '"auth"."users"' \
  '"public"."student_point_transactions"' \
  '"public"."student_workbook_unit_progress"' \
  '"storage"."objects"'; do
  if ! grep -Fq "COPY ${required_table} " "${VERIFY_TEMP_DIR}/data.sql"; then
    echo "Verified archive is missing required table ${required_table}." >&2
    exit 1
  fi
done

jq -cn \
  --arg event "treeschool.database_backup.verified" \
  --arg object "${BACKUP_OBJECT}" \
  --arg createdAt "$(jq -er '.createdAt' "${VERIFY_TEMP_DIR}/manifest.json")" \
  '{event: $event, object: $object, createdAt: $createdAt}'
