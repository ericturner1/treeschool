# Assessment generation implementation plan

Status: planned, not yet implemented

This document describes how Treeschool should generate and deliver tests from
Workbook Studio content. The core decision is to create one versioned,
structured assessment model and render it in two ways: printable PDFs and
interactive screen-based tests.

## Product direction

Treeschool has enough structured metadata to generate useful draft assessments
for Workbook Studio workbooks. It does not yet have enough reliable item-level
metadata to automatically generate trustworthy tests from every legacy
PDF-only workbook.

The first release should therefore:

1. generate chapter tests and periodic cumulative reviews from structured
   Workbook Studio content;
2. require admin review before an AI-generated assessment can be published;
3. render the same published assessment as both a student PDF and an optional
   screen-based test;
4. keep open-ended writing, drawing, and similar work parent-graded; and
5. treat legacy PDF assessment generation as a later enrichment and migration
   project.

Paper should be the default delivery format for younger students and for work
that benefits from handwriting, calculations, drawing, kana, or kanji. Screen
delivery is best suited to short checks, automatically gradable questions,
audio or listening tasks, and spaced review.

## What the codebase supports today

### Workbook Studio structured content

`app/ts-backend/src/services/workbook-studio-model.ts` provides the strongest
source material for assessment generation:

- stable chapter, lesson, and exercise IDs;
- standards codes attached to lessons and exercises;
- structured teaching blocks and reading passages;
- multiple choice, circle choice, matching, fill-in-the-blank, short-answer,
  writing, and drawing exercises; and
- correct answers or sample answers for the applicable exercise types.

This is sufficient to select covered skills, generate new questions, preserve
source provenance, and mechanically validate many answer types.

### Curriculum coverage metadata

`app/ts-backend/src/services/curriculum-coverage.ts` records competency IDs,
coverage depth, strength, confidence, and unit/page evidence. It is useful for
deciding what an assessment should cover and how heavily each competency should
be weighted. It must not be treated as the source of correct answers.

### Legacy PDF analysis

`DocumentAnalysis` in `app/ts-backend/src/services/paper-plans.ts` contains
learning units, page ranges, categories such as practice or assessment,
confidence, and evidence. That is enough to locate likely source material, but
not enough to guarantee item-level question meaning, accepted answers, or
rubrics. Legacy PDF-generated tests need an explicit enrichment and review step.

### Existing screen quiz behavior

`submitLessonQuiz` in `app/ts-backend/src/services/lessons.ts` already provides
basic multiple-choice grading and mastery/streak updates. The current lesson
attempt records are too narrow to be the canonical assessment-authoring model,
but the grading and progress behavior can be reused or adapted by the delivery
layer.

## Canonical assessment model

Assessments should be independent, versioned authoring objects. A test must not
exist only as generated PDF bytes or as fields embedded in a lesson attempt.

Recommended records:

### `assessments`

The stable identity and ownership record.

- `id`
- `workbook_project_id` or released `native_workbook_id`
- `kind`: `lesson_check`, `chapter_test`, `cumulative_review`, `placement`, or
  `custom`
- `title`
- `status`: `draft`, `in_review`, `published`, or `archived`
- `created_by`
- timestamps

### `assessment_versions`

Immutable assessment definitions.

- `id`
- `assessment_id`
- monotonic version number
- `source`: `manual`, `ai_generated`, `imported`, or `revised`
- source workbook content-revision ID
- generation-run ID when applicable
- structured assessment JSON
- validation result JSON
- review metadata
- created timestamp

A published delivery always pins an exact assessment-version ID. Editing a
published test creates a new immutable version.

### Structured assessment JSON

The initial schema should contain:

- assessment instructions, estimated duration, total points, and locale;
- one or more sections with delivery and layout instructions; and
- ordered items with:
  - stable item ID;
  - item type;
  - prompt and optional supporting content;
  - choices, matching pairs, or response-space configuration;
  - correct answer, accepted answers, or grading rubric;
  - explanation for the parent/answer key;
  - point value;
  - difficulty and cognitive level;
  - workbook revision, chapter, lesson, exercise, and competency references;
  - source evidence references;
  - automatic-grading eligibility; and
  - validation and approval state.

V1 item types should align with the existing Workbook Studio vocabulary:

- multiple choice and circle choice;
- matching;
- fill in the blank;
- short answer;
- written response; and
- drawing or workspace box.

Audio/listening and richer interactive types can be added without changing the
versioning model.

### Attempts and responses

Screen delivery needs normalized attempt data rather than only aggregate
scores:

- `assessment_assignments` pins the student, assessment version, learning-plan
  context, due date, and delivery mode;
- `assessment_attempts` stores lifecycle, score, grader, and completion data;
- `assessment_responses` stores each item response, awarded points, grading
  status, feedback, and answer snapshot.

The answer key must come from the pinned assessment version, never from a later
draft.

## Generation workflow

Assessment generation should use the existing claimed-job pattern rather than
performing model calls inside an HTTP request.

1. An admin chooses the source workbook revision, assessment kind, scope, item
   count, target duration, delivery modes, and difficulty mix.
2. The server builds a source packet from selected lessons, exercises,
   standards, competency coverage, and any relevant passages.
3. A generation job asks the configured model for structured assessment JSON,
   not PDF or HTML.
4. Deterministic validation checks IDs, source references, point totals,
   duplicate questions, choice validity, answer presence, supported item types,
   and requested competency coverage.
5. The admin reviews and edits the test, answers, explanations, and rubric.
6. Publishing creates an immutable version and enables delivery rendering.

Generation rules should be stored as versioned records separate from prompt
text, following Workbook Studio's existing rules-as-records approach. Examples
include minimum source coverage, maximum repeated skill concentration, choice
count, answer uniqueness, age-appropriate reading level, required evidence,
and automatic-grading constraints.

AI output must never become student-visible merely because the generation job
completed. Publication is a separate, explicit action.

## Paper PDF delivery

The PDF renderer consumes a published assessment version and produces:

- a student test without answers;
- a separate parent/teacher answer key with explanations and rubrics; and
- optional compact or duplex-friendly variants later.

It should reuse Workbook Studio's deterministic Chromium/Paged.js rendering,
pinned fonts, theme resolution, and render-artifact records. The assessment
should inherit the workbook's effective theme version by default while allowing
an explicit assessment-print profile for denser test layout.

Every rendered artifact should record the exact assessment version, theme
version, renderer versions, page count, storage object, and content hash.

## Screen delivery

The screen player renders the same published items one at a time or by section.
It should support saving progress, resuming an attempt, accessibility-friendly
keyboard controls, and clear parent review.

Automatically gradable V1 types are multiple choice, circle choice, matching,
and carefully constrained fill-in-the-blank. Short answers may be auto-checked
only when explicit accepted answers exist; parents should be able to override
the result. Writing and drawing remain pending until a parent assigns points.

Published score changes should flow through the existing learning progress and
points systems using explicit assessment events, so rewards are idempotent and
auditable.

## Workbook and edition behavior

An assessment pins a specific workbook content revision. Wording fixes that
preserve the workbook's stable lesson IDs do not silently rewrite an already
published assessment. An admin may create a refreshed assessment version when
the source revision changes.

A new workbook edition caused by adding or removing lessons requires an
assessment compatibility review. Tests may be copied forward as drafts, but
must not automatically publish against the new edition because their coverage
may no longer be complete.

## Legacy PDF strategy

Legacy workbooks remain usable as they are. Assessment generation for them
should be introduced later through a controlled enrichment workflow:

1. select learning units and referenced PDF pages;
2. extract or transcribe candidate exercises and source passages;
3. assign stable item, lesson, and competency references;
4. generate answer data and rubrics with source evidence;
5. require human review; and
6. save the result into the same canonical assessment model.

This avoids creating a second legacy-only test engine. Migrating a legacy
workbook into Workbook Studio will provide the higher-quality path.

## Safety and quality gates

Before publication, require:

- all referenced lesson and competency IDs to exist in the pinned source;
- every auto-graded item to have an unambiguous valid answer;
- point totals and section totals to agree;
- no answer-key content in the student payload or student PDF;
- source evidence for generated factual questions;
- locale-appropriate fonts and layout checks;
- render smoke tests for both student and answer-key PDFs; and
- an identified human reviewer.

Sensitive answer-key endpoints must enforce parent/admin authorization. Student
clients should receive a delivery payload that omits correct answers and
rubrics until the relevant review policy permits their release.

## Recommended implementation phases

### Phase 1: Canonical authoring and printable chapter tests

- Add the assessment, version, generation-run, and job schema.
- Add structured assessment validation.
- Add an admin generator/editor/review flow.
- Generate chapter tests from Workbook Studio revisions.
- Render student PDFs and separate answer keys.
- Add golden render and answer-leakage tests.

### Phase 2: Screen-based delivery

- Add assignments, attempts, and item responses.
- Build the student test player and parent review screen.
- Auto-grade objective item types.
- Connect results to progress and points with idempotent events.

### Phase 3: Cumulative and scheduled assessment planning

- Generate cumulative reviews across chapters or date ranges.
- Use competency coverage to balance the blueprint.
- Allow assessments to be scheduled into lesson plans.
- Add longitudinal mastery reporting.

### Phase 4: Legacy enrichment

- Build the PDF source-review and transcription workflow.
- Import or generate assessment items with page evidence.
- Require human approval and confidence thresholds.
- Reuse the same paper and screen delivery paths.

## Acceptance criteria for the first release

- An admin can generate a draft chapter test from a published Workbook Studio
  content revision.
- Every generated item identifies its source lesson and relevant competency.
- Invalid or incomplete answers block publication.
- An admin can edit, review, and publish an immutable assessment version.
- The system produces a printable student test and a separate correct answer
  key from that version.
- A student cannot retrieve answers through the test-delivery API.
- Published artifacts are reproducible from recorded versions and hashes.
- Legacy PDFs continue to work unchanged and are not presented as automatically
  assessment-ready.
