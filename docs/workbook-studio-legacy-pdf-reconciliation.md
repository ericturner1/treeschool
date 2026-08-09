# Workbook Studio follow-up phase: legacy PDF reconciliation

## When to run this phase

Run this phase only after Workbook Studio's structured authoring, rendering,
validation, and `native_workbook_versions` publishing path has been implemented
and verified.

This is a one-time catalog reconciliation and legacy-artifact import phase. It
is deliberately separate from the Workbook Studio implementation so that
legacy PDFs cannot complicate or weaken the new structured content model.

## Objective

Inventory the shipped workbook PDFs in:

`/Users/eric/Documents/TreeSchool/treeschool-workbooks/workbook-content/`

Match every canonical PDF to its corresponding `native_workbooks`,
`native_workbook_editions`, and `native_workbook_versions` records. Import only
PDF artifacts that are genuinely absent from platform storage, using the
existing native-workbook upload/indexing lifecycle.

Finish with an auditable manifest that proves where every local PDF ended up or
why it was intentionally excluded.

## Hard boundary

This phase **does**:

- Reconcile local PDF artifacts against the platform catalog and private object
  storage.
- Import a missing PDF as a legacy/native workbook artifact when required.
- Preserve its edition, revision, price, catalog metadata, and published state.
- Verify that purchases and download links continue to resolve through the
  existing native-workbook machinery.

This phase **does not**:

- Parse an existing PDF or `workbook.html` into Workbook Studio chapters,
  lessons, blocks, exercises, answers, illustrations, or standards links.
- Create a `workbook_content_revision` for a legacy book.
- Regenerate or visually modify a shipped PDF.
- Replace an existing platform PDF merely because a similarly named local file
  exists.
- Treat backup PDFs, QA exports, alternate spellings, or intermediate drafts as
  canonical without explicit review.

Legacy versions imported here must have `artifactSource = "upload"` (or the
equivalent legacy value) and a null `contentRevisionId`. Workbook Studio-created
versions use `artifactSource = "studio"` and must never be overwritten by this
process.

## Prerequisites

Before beginning, confirm all of the following:

1. The Workbook Studio migrations and native-release integration are deployed.
2. Existing production native-workbook download and indexing flows are healthy.
3. The operator has read-only access to production catalog/version metadata and
   object metadata, plus separately controlled write access for approved
   imports.
4. A database backup or point-in-time recovery window covers the import period.
5. The importer supports a mandatory dry-run mode and does not mutate data or
   upload objects during dry-run.
6. The source folder is treated as read-only. The reconciliation process must
   not rename, move, rewrite, or delete files in `treeschool-workbooks`.

## Required deliverables

Implement or provide:

- A repeatable inventory command/script.
- A deterministic matching and duplicate-detection report.
- A dry-run import plan requiring explicit approval before writes.
- An idempotent importer built on existing native-workbook service primitives.
- A machine-readable manifest (JSON or CSV) and a human-readable summary.
- Post-import database, object-storage, indexing, storefront, and download
  verification.

Keep the importer in the `treeschool` monorepo. Do not make production runtime
code depend on the sibling `treeschool-workbooks` folder.

## Phase 1: inventory the source folder

Recursively enumerate `*.pdf` files beneath the source root. For every file,
record:

- Absolute and source-root-relative path.
- Filename and normalized filename.
- Byte size.
- SHA-256 checksum.
- PDF page count.
- PDF title metadata, if present.
- Candidate subject, grade/range, level/volume, core/elective designation,
  edition label, and revision inferred from the path and filename.
- Whether a sibling `workbook.html`, `curriculum.md`, or `outline.md` exists.
- Classification: `candidate`, `duplicate`, `backup`, `qa_export`,
  `intermediate`, or `needs_review`.

Do not select a canonical file solely by modification time. The folder contains
alternate names, spelling variants, backup outputs, and QA files. Files with
the same checksum are binary duplicates even when their names differ.

## Phase 2: inventory the platform

Export the relevant platform records without modifying them:

- `native_workbooks` catalog identity and pricing state.
- `native_workbook_editions` edition numbers, labels, and statuses.
- `native_workbook_versions` version/revision numbers, release status,
  `objectPath`, size, page count, fingerprint/checksum, `artifactSource`, and
  `contentRevisionId`.
- Private object-storage metadata for every referenced `objectPath`.

Report dangling database paths, missing objects, duplicate fingerprints, and
objects whose stored size or checksum disagrees with the database.

## Phase 3: deterministic matching

Match in this order, stopping at the first unambiguous result:

1. Exact SHA-256 checksum/fingerprint.
2. Existing object checksum plus byte size and page count.
3. Explicit workbook slug/ID mapping maintained in a reviewed mapping file.
4. Normalized title, subject, grade/range, edition, revision, page count, and
   filename together.

Filename similarity by itself is never sufficient for an automatic match.

Each local candidate must end in exactly one state:

- `already_present_exact`
- `already_present_equivalent_name`
- `missing_from_platform`
- `conflicts_with_platform`
- `duplicate_local_file`
- `excluded_noncanonical`
- `needs_manual_review`

Any ambiguous, conflicting, or multiple-edition match remains read-only until
an admin resolves it in the mapping file.

## Phase 4: produce and approve a dry-run plan

The dry run must list every proposed mutation before any upload or database
write. For each proposed import, show:

- Source path and checksum.
- Target workbook ID/slug.
- Target edition and revision.
- Whether new workbook, edition, or version records would be created.
- Proposed private `objectPath`.
- Proposed catalog and release status.
- Whether indexing will be queued.
- Any catalog metadata that cannot be derived safely and requires an explicit
  value.

The dry run must fail closed when:

- A target version already has a different object/checksum.
- A proposed write could replace an active version.
- The edition/revision mapping is ambiguous.
- A source PDF is unreadable or has zero pages.
- A required price, currency, subject, grade, or edition value is missing.
- A proposed legacy version would point to a Workbook Studio content revision.

Require explicit approval of the reviewed dry-run manifest before enabling
write mode.

## Phase 5: import missing legacy artifacts

For approved `missing_from_platform` rows only:

1. Create or select the intended native workbook, edition, and version using
   existing service-layer primitives. Refactor shared primitives if necessary;
   do not reproduce release logic in a standalone SQL script.
2. Upload the original PDF bytes without modifying or re-rendering them.
3. Verify the uploaded object's checksum and size before marking the upload
   complete.
4. Queue the existing `native_workbook_jobs` indexing path.
5. Preserve the intended edition/revision identifiers and change notes.
6. Keep the version non-active until indexing and verification succeed.
7. Publish or activate only when the approved manifest explicitly says that the
   source was already a shipped/published release.

The importer must be idempotent: rerunning the same approved manifest must
produce no duplicate workbook, edition, version, job, or object records.

Do not use the replacement-PDF flow to force a local file over an existing
active version. A checksum conflict requires manual investigation.

## Phase 6: verification

For every imported version, verify:

- Database checksum/fingerprint, size, MIME type, and page count match the
  source inventory.
- The private object exists at the recorded path and hashes to the source
  checksum.
- Native workbook indexing completes successfully.
- Lesson/unit analysis is present and usable for the legacy PDF path.
- Cover thumbnail and bookstore preview generation complete where applicable.
- The intended version and edition status are correct.
- Published-and-priced workbooks appear in the storefront exactly once.
- An entitled test account can obtain a signed download URL and download bytes
  matching the source checksum.
- Existing purchases still resolve to their previously pinned version.
- No Workbook Studio-authored version or content revision was changed.

Spot-check the rendered pages against the original local PDF. Since the
original bytes are uploaded unchanged, any visual difference indicates that a
different file was selected or downloaded.

## Manifest contract

The final manifest should contain at least:

```text
sourceRelativePath
sourceSha256
sourceSizeBytes
sourcePageCount
classification
resolution
workbookId
workbookSlug
editionId
editionNumber
versionId
revisionNumber
objectPath
artifactSource
contentRevisionId
indexingStatus
releaseStatus
storefrontVerified
downloadVerified
notes
```

Commit the reviewed manifest format and importer code. Do not commit production
credentials, signed URLs, or private PDF bytes to the `treeschool` repository.
Store the completed production manifest in the approved operational/audit
location.

## Recovery and rollback

If an import fails before activation:

- Leave existing active versions unchanged.
- Mark or remove only the newly created, unreferenced draft version through a
  reviewed service operation.
- Delete only the exact newly uploaded object after confirming no database,
  purchase, content-document, or download reference points to it.
- Preserve the failure and resolution in the manifest.

Never automatically delete or roll back a version that has become active, has a
purchase reference, or has been attached to a learning year. Escalate those
cases for an explicit recovery plan.

## Completion criteria

This phase is complete when:

1. Every PDF in the source tree has a documented classification and resolution.
2. Every canonical shipped PDF is either matched to an exact platform artifact
   or imported and verified.
3. No unresolved checksum, edition, or active-version conflicts remain.
4. The importer can be rerun in dry-run mode and reports zero pending mutations.
5. Storefront and entitled-download checks pass for all imported published
   releases.
6. Existing Workbook Studio content and legacy customer version pinning remain
   unchanged.

## Suggested pickup prompt

> Implement the post-Workbook Studio legacy PDF reconciliation phase described
> in `docs/workbook-studio-legacy-pdf-reconciliation.md`. Begin with a read-only
> inventory of the sibling `treeschool-workbooks/workbook-content/` folder and
> the platform's native-workbook metadata. Produce the dry-run manifest and
> conflict report before performing any uploads or database writes.
