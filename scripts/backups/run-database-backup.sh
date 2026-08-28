#!/usr/bin/env bash
set -Eeuo pipefail

umask 077

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required environment variable: ${name}" >&2
    exit 1
  fi
}

require_env DATABASE_URL
require_env BACKUP_BUCKET
require_env BACKUP_AGE_RECIPIENT

if [[ ! "${BACKUP_BUCKET}" =~ ^gs://[^/]+/?$ ]]; then
  echo "BACKUP_BUCKET must be a bucket URL such as gs://treeschool-backups." >&2
  exit 1
fi
if [[ ! "${BACKUP_AGE_RECIPIENT}" =~ ^age1[0-9a-z]+$ ]]; then
  echo "BACKUP_AGE_RECIPIENT is not a valid age recipient." >&2
  exit 1
fi

DATABASE_CONNECTION_JSON="$(python3 - <<'PY'
import json
import os
from urllib.parse import unquote, urlparse

database_url = urlparse(os.environ["DATABASE_URL"])
if database_url.scheme not in {"postgres", "postgresql"}:
    raise SystemExit("DATABASE_URL must be a PostgreSQL connection URL.")
if not all((database_url.hostname, database_url.username, database_url.path)):
    raise SystemExit("DATABASE_URL is missing required connection fields.")

print(json.dumps({
    "host": database_url.hostname,
    "port": database_url.port or 5432,
    "database": unquote(database_url.path.lstrip("/")),
    "username": unquote(database_url.username),
    "password": unquote(database_url.password or ""),
}))
PY
)"
export PGHOST="$(jq -er '.host' <<< "${DATABASE_CONNECTION_JSON}")"
export PGPORT="$(jq -er '.port' <<< "${DATABASE_CONNECTION_JSON}")"
export PGDATABASE="$(jq -er '.database' <<< "${DATABASE_CONNECTION_JSON}")"
export PGUSER="$(jq -er '.username' <<< "${DATABASE_CONNECTION_JSON}")"
export PGPASSWORD="$(jq -er '.password' <<< "${DATABASE_CONNECTION_JSON}")"
export PGSSLMODE="require"
export PGOPTIONS="-c default_transaction_read_only=on -c statement_timeout=2700000"
unset DATABASE_URL DATABASE_CONNECTION_JSON

BACKUP_BUCKET="${BACKUP_BUCKET%/}"
BACKUP_SOURCE="${BACKUP_SOURCE:-treeschool-production}"
APP_GIT_REVISION="${APP_GIT_REVISION:-unknown}"
BACKUP_TEMP_DIR="$(mktemp -d)"
BACKUP_STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
BACKUP_TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_YEAR="${BACKUP_TIMESTAMP:0:4}"
BACKUP_MONTH="${BACKUP_TIMESTAMP:4:2}"
BACKUP_DAY="${BACKUP_TIMESTAMP:6:2}"
BACKUP_BASENAME="${BACKUP_TIMESTAMP}-${APP_GIT_REVISION}"
BACKUP_FAILED=true

notify_failure() {
  if [[ -z "${ADMIN_ALERT_WEBHOOK_URL:-}" ]]; then
    return
  fi
  local payload
  payload="$(jq -cn \
    --arg title "Treeschool production backup failed" \
    --arg source "${BACKUP_SOURCE}" \
    --arg startedAt "${BACKUP_STARTED_AT}" \
    '{title: $title, source: $source, startedAt: $startedAt}')"
  curl --fail --silent --show-error \
    -H "content-type: application/json" \
    --data "${payload}" \
    "${ADMIN_ALERT_WEBHOOK_URL}" >/dev/null || true
}

cleanup() {
  local status=$?
  rm -rf "${BACKUP_TEMP_DIR}"
  if [[ "${BACKUP_FAILED}" == true ]]; then
    notify_failure
  fi
  return "${status}"
}
trap cleanup EXIT

SCHEMA_EXCLUDES="information_schema|pg_*|_analytics|_realtime|_supavisor|auth|etl|extensions|pgbouncer|realtime|storage|supabase_functions|supabase_migrations|cron|dbdev|graphql|graphql_public|net|pgmq|pgsodium|pgsodium_masks|pgtle|repack|tiger|tiger_data|timescaledb_*|_timescaledb_*|topology|vault"
DATA_EXCLUDES="information_schema|pg_*|graphql|graphql_public|pgsodium|pgsodium_masks|pgtle|repack|tiger|tiger_data|timescaledb_*|_timescaledb_*|topology|vault|etl|extensions|pgbouncer|realtime|supabase_migrations|_analytics|_realtime|_supavisor"

echo "Creating Treeschool database backup ${BACKUP_BASENAME}."

pg_dumpall \
  --database="${PGDATABASE}" \
  --roles-only \
  --quote-all-identifiers \
  --no-role-passwords \
  --no-comments \
| sed -E 's/^\\(un)?restrict .*$/-- &/' \
| sed -E 's/^CREATE ROLE "(anon|authenticated|authenticator|cli_login_.*|dashboard_user|pgbouncer|postgres|service_role|supabase_.*|pgsodium_keyholder|pgsodium_keyiduser|pgsodium_keymaker|pgtle_admin)"/-- &/' \
| sed -E 's/^ALTER ROLE "(anon|authenticated|authenticator|cli_login_.*|dashboard_user|pgbouncer|postgres|service_role|supabase_.*|pgsodium_keyholder|pgsodium_keyiduser|pgsodium_keymaker|pgtle_admin)"/-- &/' \
| sed -E 's/ (NOSUPERUSER|NOREPLICATION)//g' \
| sed -E 's/^-- (.* SET "(pgaudit.*|pgrst.*|session_replication_role|statement_timeout|track_io_timing)" .*)/\1/' \
| sed -E 's/GRANT ".*" TO "(anon|authenticated|authenticator|cli_login_.*|dashboard_user|pgbouncer|postgres|service_role|supabase_.*|pgsodium_keyholder|pgsodium_keyiduser|pgsodium_keymaker|pgtle_admin)"/-- &/' \
| sed -E '/^--/d' \
| uniq \
> "${BACKUP_TEMP_DIR}/roles.sql"
echo "RESET ALL;" >> "${BACKUP_TEMP_DIR}/roles.sql"

pg_dump \
  --dbname="${PGDATABASE}" \
  --schema-only \
  --quote-all-identifiers \
  --exclude-schema="${SCHEMA_EXCLUDES}" \
| sed -E 's/^\\(un)?restrict .*$/-- &/' \
| sed -E 's/^CREATE SCHEMA "/CREATE SCHEMA IF NOT EXISTS "/' \
| sed -E 's/^CREATE TABLE "/CREATE TABLE IF NOT EXISTS "/' \
| sed -E 's/^CREATE SEQUENCE "/CREATE SEQUENCE IF NOT EXISTS "/' \
| sed -E 's/^CREATE VIEW "/CREATE OR REPLACE VIEW "/' \
| sed -E 's/^CREATE FUNCTION "/CREATE OR REPLACE FUNCTION "/' \
| sed -E 's/^CREATE TRIGGER "/CREATE OR REPLACE TRIGGER "/' \
| sed -E 's/^CREATE PUBLICATION "supabase_realtime/-- &/' \
| sed -E 's/^CREATE EVENT TRIGGER /-- &/' \
| sed -E 's/^         WHEN TAG IN /-- &/' \
| sed -E 's/^   EXECUTE FUNCTION /-- &/' \
| sed -E 's/^ALTER EVENT TRIGGER /-- &/' \
| sed -E 's/^ALTER PUBLICATION "supabase_realtime_/-- &/' \
| sed -E 's/^ALTER FOREIGN DATA WRAPPER (.+) OWNER TO /-- &/' \
| sed -E 's/^ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin"/-- &/' \
| sed -E 's/^GRANT ALL ON FOREIGN DATA WRAPPER (.+) TO "postgres" WITH GRANT OPTION/-- &/' \
| sed -E "s/^GRANT (.+) ON (.+) \"(${SCHEMA_EXCLUDES})\"/-- &/" \
| sed -E "s/^REVOKE (.+) ON (.+) \"(${SCHEMA_EXCLUDES})\"/-- &/" \
| sed -E 's/^(CREATE EXTENSION IF NOT EXISTS "pg_tle").+/\1;/' \
| sed -E 's/^(CREATE EXTENSION IF NOT EXISTS "pgsodium").+/\1;/' \
| sed -E 's/^(CREATE EXTENSION IF NOT EXISTS "pgmq").+/\1;/' \
| sed -E 's/^COMMENT ON EXTENSION (.+)/-- &/' \
| sed -E 's/^CREATE POLICY "cron_job_/-- &/' \
| sed -E 's/^ALTER TABLE "cron"/-- &/' \
| sed -E 's/^SET transaction_timeout = 0;/-- &/' \
| sed -E '/^--/d' \
> "${BACKUP_TEMP_DIR}/schema.sql"

pg_dump \
  --dbname="${PGDATABASE}" \
  --data-only \
  --quote-all-identifiers \
  --exclude-schema="${DATA_EXCLUDES}" \
  --exclude-table="auth.schema_migrations" \
  --exclude-table="storage.migrations" \
  --exclude-table="supabase_functions.migrations" \
  --schema="*" \
| sed -E 's/^\\(un)?restrict .*$/-- &/' \
> "${BACKUP_TEMP_DIR}/data.sql"
echo "RESET ALL;" >> "${BACKUP_TEMP_DIR}/data.sql"

for required_table in \
  '"auth"."users"' \
  '"public"."student_point_transactions"' \
  '"public"."student_workbook_unit_progress"' \
  '"storage"."objects"'; do
  if ! grep -Fq "COPY ${required_table} " "${BACKUP_TEMP_DIR}/data.sql"; then
    echo "Backup data is missing required table ${required_table}." >&2
    exit 1
  fi
done

pg_dump \
  --dbname="${PGDATABASE}" \
  --data-only \
  --quote-all-identifiers \
  --schema="supabase_migrations" \
  --table="supabase_migrations.schema_migrations" \
  --no-owner \
  --no-privileges \
> "${BACKUP_TEMP_DIR}/migration-history.sql"

for required_file in roles.sql schema.sql data.sql migration-history.sql; do
  if [[ ! -s "${BACKUP_TEMP_DIR}/${required_file}" ]]; then
    echo "Backup file ${required_file} is empty." >&2
    exit 1
  fi
done

DATABASE_VERSION="$(psql --dbname="${PGDATABASE}" --tuples-only --no-align --command 'show server_version;' | tr -d '\r\n')"
jq -n \
  --arg formatVersion "1" \
  --arg source "${BACKUP_SOURCE}" \
  --arg createdAt "${BACKUP_STARTED_AT}" \
  --arg databaseVersion "${DATABASE_VERSION}" \
  --arg gitRevision "${APP_GIT_REVISION}" \
  --arg rolesSha256 "$(sha256sum "${BACKUP_TEMP_DIR}/roles.sql" | cut -d' ' -f1)" \
  --arg schemaSha256 "$(sha256sum "${BACKUP_TEMP_DIR}/schema.sql" | cut -d' ' -f1)" \
  --arg dataSha256 "$(sha256sum "${BACKUP_TEMP_DIR}/data.sql" | cut -d' ' -f1)" \
  --arg migrationHistorySha256 "$(sha256sum "${BACKUP_TEMP_DIR}/migration-history.sql" | cut -d' ' -f1)" \
  '{
    formatVersion: ($formatVersion | tonumber),
    source: $source,
    createdAt: $createdAt,
    databaseVersion: $databaseVersion,
    gitRevision: $gitRevision,
    files: {
      "roles.sql": {sha256: $rolesSha256},
      "schema.sql": {sha256: $schemaSha256},
      "data.sql": {sha256: $dataSha256},
      "migration-history.sql": {sha256: $migrationHistorySha256}
    }
  }' > "${BACKUP_TEMP_DIR}/backup-metadata.json"

tar \
  --directory="${BACKUP_TEMP_DIR}" \
  --create \
  --file="${BACKUP_TEMP_DIR}/database-backup.tar" \
  roles.sql schema.sql data.sql migration-history.sql backup-metadata.json
zstd --quiet --threads=0 --ultra -19 \
  "${BACKUP_TEMP_DIR}/database-backup.tar" \
  -o "${BACKUP_TEMP_DIR}/database-backup.tar.zst"
zstd --quiet --test "${BACKUP_TEMP_DIR}/database-backup.tar.zst"
age \
  --recipient="${BACKUP_AGE_RECIPIENT}" \
  --output="${BACKUP_TEMP_DIR}/database-backup.tar.zst.age" \
  "${BACKUP_TEMP_DIR}/database-backup.tar.zst"

ENCRYPTED_SHA256="$(sha256sum "${BACKUP_TEMP_DIR}/database-backup.tar.zst.age" | cut -d' ' -f1)"
ENCRYPTED_SIZE="$(stat --format='%s' "${BACKUP_TEMP_DIR}/database-backup.tar.zst.age")"
NIGHTLY_BASE="nightly/${BACKUP_YEAR}/${BACKUP_MONTH}/${BACKUP_DAY}/${BACKUP_BASENAME}"
NIGHTLY_OBJECT="${BACKUP_BUCKET}/${NIGHTLY_BASE}.tar.zst.age"
NIGHTLY_MANIFEST="${BACKUP_BUCKET}/${NIGHTLY_BASE}.manifest.json"

jq -n \
  --arg formatVersion "1" \
  --arg source "${BACKUP_SOURCE}" \
  --arg createdAt "${BACKUP_STARTED_AT}" \
  --arg object "${NIGHTLY_OBJECT}" \
  --arg sha256 "${ENCRYPTED_SHA256}" \
  --arg sizeBytes "${ENCRYPTED_SIZE}" \
  --arg encryption "age-x25519" \
  '{
    formatVersion: ($formatVersion | tonumber),
    source: $source,
    createdAt: $createdAt,
    object: $object,
    sha256: $sha256,
    sizeBytes: ($sizeBytes | tonumber),
    encryption: $encryption
  }' > "${BACKUP_TEMP_DIR}/manifest.json"

gcloud storage cp \
  --if-generation-match=0 \
  --storage-class=STANDARD \
  "${BACKUP_TEMP_DIR}/database-backup.tar.zst.age" \
  "${NIGHTLY_OBJECT}"
gcloud storage cp \
  --if-generation-match=0 \
  --storage-class=STANDARD \
  "${BACKUP_TEMP_DIR}/manifest.json" \
  "${NIGHTLY_MANIFEST}"
gcloud storage objects describe "${NIGHTLY_OBJECT}" --format='value(size)' | grep -qx "${ENCRYPTED_SIZE}"

if [[ "${BACKUP_DAY}" == "01" ]]; then
  MONTHLY_BASE="monthly/${BACKUP_YEAR}/${BACKUP_MONTH}/${BACKUP_BASENAME}"
  gcloud storage cp \
    --if-generation-match=0 \
    --storage-class=ARCHIVE \
    "${BACKUP_TEMP_DIR}/database-backup.tar.zst.age" \
    "${BACKUP_BUCKET}/${MONTHLY_BASE}.tar.zst.age"
  jq --arg object "${BACKUP_BUCKET}/${MONTHLY_BASE}.tar.zst.age" '.object = $object' \
    "${BACKUP_TEMP_DIR}/manifest.json" > "${BACKUP_TEMP_DIR}/monthly-manifest.json"
  gcloud storage cp \
    --if-generation-match=0 \
    --storage-class=ARCHIVE \
    "${BACKUP_TEMP_DIR}/monthly-manifest.json" \
    "${BACKUP_BUCKET}/${MONTHLY_BASE}.manifest.json"
fi

BACKUP_FAILED=false
jq -cn \
  --arg event "treeschool.database_backup.succeeded" \
  --arg createdAt "${BACKUP_STARTED_AT}" \
  --arg object "${NIGHTLY_OBJECT}" \
  --arg sha256 "${ENCRYPTED_SHA256}" \
  --arg sizeBytes "${ENCRYPTED_SIZE}" \
  '{event: $event, createdAt: $createdAt, object: $object, sha256: $sha256, sizeBytes: ($sizeBytes | tonumber)}'
