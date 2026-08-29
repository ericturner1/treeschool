# Academic progress backup and recovery

Treeschool creates an independent encrypted logical backup of its Supabase
database every night. The backup contains the public application schema and
data, Supabase-managed Auth data and Storage metadata, migration history, and
custom roles. Original database passwords are not included. Storage object
payloads are outside this database-backup scope.

The backup is intentionally separate from application undo history such as
`plan_versions`. An attacker who deletes production rows must not be able to
delete the corresponding backup.

## Production layout

- Cloud Run Job: `treeschool-database-backup`
- Cloud Scheduler: `treeschool-database-backup-nightly`
- Schedule: 02:30 Asia/Tokyo
- Failure alert: `Treeschool production database backup failed`
- Alert recipient: `ericsturner1@gmail.com`
- Writer identity: `treeschool-backup@treeschool.iam.gserviceaccount.com`
- Backup project: `treeschool-backups-274426`
- Bucket: `treeschool-backups-274426411544`
- Encryption: age/X25519 before upload

The writer can create and verify objects but cannot replace or delete them.
The API, frontend, and processor identities have no backup-bucket access. The
age private key is stored only in the backup project as
`treeschool-backup-age-private-key`; the production job receives only its
public recipient.

The production API identity has narrowly scoped Cloud Run permissions to view
backup job executions and request a run. It cannot read, replace, delete, or
decrypt backup objects.

Nightly files begin in Standard storage. After seven days, lifecycle rules move
them to Coldline. They are deleted after 100 days, which is longer than
Coldline's 90-day minimum after transition. A second Archive copy is written on
the first day of each month and retained for 370 days.

The bucket also has a 100-day, currently unlocked retention period and 30-day
soft deletion. Do not lock the retention policy until multiple restore drills
have succeeded; locking it is irreversible.

## Provision and deploy

From the repository root:

```sh
bash scripts/gcp/setup-backups.sh
bash scripts/gcp/deploy-backups.sh
gcloud run jobs execute treeschool-database-backup \
  --project treeschool \
  --region asia-northeast3 \
  --wait
```

The setup command is idempotent. It creates the separate project, protected
bucket, encryption key, limited writer permissions, failure log metric, and
Cloud Monitoring email alert.

The database connection is stored separately as `BACKUP_DATABASE_URL` in the
production Secret Manager. The dump process requests read-only transactions
by default and passes credentials to PostgreSQL through private environment
fields, so command errors do not print the connection URL.
Only the dedicated backup service account can access that secret; the API,
frontend, and processor identities cannot.

## Admin visibility

Administrators can open **Admin → Backups** to see the latest successful
archive, the automatic schedule, retention periods, and recent job results.
The **Run backup now** action is intentionally a little frictiony: it opens a
confirmation dialog and requires the exact phrase `RUN BACKUP`. It also refuses
to enqueue a duplicate while a backup is already running.

The admin page never exposes archive paths, database credentials, decrypted
data, or encryption keys. It has no restore action. A successful row means the
job completed its encrypted upload and archive-size check; it does not replace
the isolated restore validation described below.

Any future in-app deletion of backup archives must require a separate,
destructive-action design review. Do not add archive deletion to the same API
identity used by the admin status page.

Supabase's free tier does not let the project `postgres` user create a custom
login with `BYPASSRLS`. A complete dump (including rows protected by RLS and
Supabase Auth data) therefore has to use the project's direct database role.
The read-only connection default protects against accidental writes, but is
not a server-enforced boundary because a holder of the credential could
override it. Treat the backup service account as a database administrator and
rotate both database secrets if it is ever compromised.

## Verify a backup

Verification downloads the encrypted object, checks its external checksum,
decrypts it, tests the compressed archive, and validates every internal SQL
file against metadata protected inside the encrypted archive.

```sh
key_file="$(mktemp)"
gcloud secrets versions access latest \
  --project treeschool-backups-274426 \
  --secret treeschool-backup-age-private-key > "${key_file}"

bash scripts/backups/verify-database-backup.sh \
  gs://treeschool-backups-274426411544/nightly/YYYY/MM/DD/TIMESTAMP-REVISION.tar.zst.age \
  "${key_file}"

rm -f "${key_file}"
```

Never paste the private key, a decrypted dump, or a database URL into chat,
source control, CI logs, or a support ticket.

## Recovery rule

Never restore directly over production first.

1. Disable production writes and rotate any credential involved in the
   incident.
2. Restore into an isolated replacement Supabase project.
3. Validate authentication, row counts, foreign keys, migrations, and several
   representative student histories.
4. For a single-account incident, copy only the affected account's records in
   a transaction after producing a dry-run diff.
5. For a full incident, switch the application to the validated replacement
   project.
6. Record the restore, the chosen recovery point, and any intentionally omitted
   newer records.

The current verifier proves archive integrity, not application correctness. A
scheduled disposable-database restore drill and a targeted account restoration
tool are the next recovery features to build.
