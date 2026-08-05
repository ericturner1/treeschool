# Workbook Studio: bring workbook authoring in-platform, under /admin

## Context

Today, every Treeschool workbook is authored outside the platform: a local pipeline
of prompt files, a Python "structured data" file per book (chapters → lessons →
learn content + typed exercises), a generator script that flattens that data into
a styled HTML file (built off `workbook-templates/workbook-template-v1`), and a
Playwright+Paged.js render step that produces the final print-ready PDF. The
finished PDF then gets uploaded to the platform, where — based on the schema —
it lands in `native_workbook_versions` (`objectPath`, `mimeType: application/pdf`)
and gets picked up by `native_workbook_jobs` for analysis (`analysisJson`,
`curriculumCoverageProfile`). In other words: today, structured metadata is
reverse-engineered from a print artifact after the fact.

We want to invert that. Workbook authoring, editing, and metadata generation
should all happen inside the platform, against one canonical structured record,
with the PDF as a rendering of that record rather than the source of truth.

This doc states the goal, the constraints, and what's already true about the
codebase and the design we need to preserve. Implementation — schema changes,
API design, job/queue mechanics, UI framework choices — is up to you. You know
this codebase; I don't want to hand you a spec that fights how `ts-backend`,
`ts-frontend`, and `ts-db` actually work today.

## What to build

An admin-only workbook production flow, under `/admin`, that replaces "author
locally, render, upload PDF" with "author and edit directly against a
structured content model, generate the PDF from that model on demand."

Three pieces:

1. **A structured, versioned content model for workbooks** — chapters, lessons,
   learn content, and typed exercises, stored as first-class records (not a
   blob), with every exercise carrying its own correct answer and standards/
   skill code as real fields rather than something inferred from parsed prose.
   This is what makes grading, progress tracking, and attendance metadata
   reliable instead of reverse-engineered.

2. **A no-code editor UI** on top of that same model, so a mistake in a shipped
   lesson can be fixed directly — text, an answer, an exercise's parameters —
   without touching code or regenerating anything by hand.

3. **AI generation that writes directly into that structured model**, calling
   the Claude API (Anthropic), rather than producing HTML for a human to place.
   Today, generating a full workbook (a curriculum plan, an outline, then full
   lesson content for every chapter) is something I (Claude) do by hand in a
   chat session, working from a set of orchestration prompts. The goal is to
   make that same generation capability a first-class, callable feature of the
   admin tool — same quality bar, same orchestration logic, just writing into
   the platform's schema instead of a local Python file, and callable without
   a chat session.

## Generation workflows, prompts, and rules

Two distinct workflow types, not one:

- **Single-workbook generation** — given a scope (subject, grade, domain list,
  locale if forked), run the stage sequence (curriculum → outline → full
  lesson content) against that one workbook, then validate and publish. This
  is the actual unit of work the admin tool executes.
- **Grade-level generation** — given a grade (and language), first produce a
  catalog plan (which subjects exist, what domains each covers, which need
  locale forks — what `grade_curriculum_planning_prompt.md` does today), then
  fan out into a batch of single-workbook runs, one per subject/variant. Build
  this as a wrapper around single-workbook generation, not a second
  content-generation path — it decides *what* to build, then hands off to the
  thing that already knows how to build one book.

Prompts should split the same way the local `prompts/` folder already
(informally) splits them, as versioned, admin-visible platform records rather
than files an engineer edits:

- **Stage prompts** — a small, fixed, generic set: plan a grade's catalog,
  write a curriculum scope, write a lesson outline, write full lesson content
  for a chapter. Same across every subject.
- **Subject overlays** — a prompt fragment specific to one subject that layers
  on top of the generic stage prompts as an addendum, the same relationship
  `prompts/math/math_workbook_orchestration_prompt.md` already has to the
  generic three-stage pipeline (it adds a math-specific "does this need an
  illustration" test and a shared SVG/CSS pattern library, and changes nothing
  else). A new subject should mean writing one new overlay, not forking the
  whole pipeline.

**Rules are the missing piece worth building properly, separate from prompts.**
A lot of what currently governs output quality lives as either my own applied
judgment or prose scattered inside individual prompt files — exactly five
exercises per lesson, vocabulary has to clear a grade-level lexicon gate
(mirrors `scripts/vocabulary/check_word.py` locally), matching-table answer
scrambles need variety with no adjacent repeats, a composition lesson needs a
majority of its exercises to actually be writing tasks, every lesson flagged
as needing an illustration has to receive one before a book ships. None of
that should require an engineer to edit a prompt to change.

Model rules as their own structured, listable/editable records — a name, a
description, a scope (global, or scoped to one subject, or one grade), and
whatever parameter the rule actually varies (an exercise count, a vocabulary
grade ceiling, a threshold) — and assemble the actual prompt sent to Claude at
generation time as **base stage prompt + subject overlay + every rule whose
scope currently applies**, rather than hand-baking rule text into prompt
prose. That's what lets an admin add or tune a rule from the UI without
touching a prompt at all.

Not everything that constrains output belongs in this layer, though. Anything
mechanically checkable — exercise/answer-key parity, scramble-pattern
variety, every flagged lesson actually having an illustration — belongs in
the save-time/publish-time validators described below, not as a prompt
instruction the model might or might not follow. Rules that are genuinely
about judgment or style (phrasing register, how strict an illustration-
necessity test should be, what fraction of a lesson's exercises should be
write-space) belong in prompt assembly. Decide per rule which bucket it's
actually in, rather than defaulting everything to "ask the AI nicely."

## Curriculum-first lifecycle: from plan to published bookstore listing

Curriculum should be a first-class entity, sitting above Workbook as a
one-to-many, not something implicit in a workbook's own metadata. This
matches how the local pipeline already works — a single `curriculum.md`
today already names multiple workbooks under one scope (e.g. Math's names
the four core-sequence books *and* the five Money locale variants and two
Measurement variants as one domain set) — it just isn't visible or editable
as its own object anywhere. Every curriculum has a standard (e.g. "US Common
Core," "NGSS," MEXT's kyoiku-kanji allocation) and a grade, same as the
parameters already stated at the top of every local curriculum-planning run.

The intended lifecycle:

1. **Author curricula first, independent of workbook generation.** An admin
   can create curricula for several grades up front and review/evaluate them
   for a while — this is the existing Stage 1 (`curriculum.md`) and Stage 2
   (`outline.md`) checkpoint the local pipeline already has, just made into a
   real, browsable object in the admin UI instead of a markdown file only I
   see mid-chat.
2. **Generate, on demand.** From inside a curriculum, a "Generate" action
   creates the workbooks it names — including every locale variant, e.g.
   Money's five and Measurement's two — as a batch of queued jobs, not a
   blocking synchronous action. Reuse the job-queue shape already established
   by `native_workbook_jobs` / `lesson_generation_jobs` / `weekly_plan_jobs`
   (`status`, `attemptCount`, `availableAt`, `claimedAt`, `heartbeatAt`,
   `workerId`, `lastError`) rather than inventing a fourth variant of the same
   pattern.
3. **Review, edit, and QC each generated workbook individually.** An admin
   opens a generated workbook in the structured editor to polish it, and can
   separately trigger an on-demand QC job — the same structural + rendered
   checks described below, just runnable as an explicit action rather than
   only running automatically pre-publish.
4. **Publish, then list on the bookstore once priced.** A published workbook
   should appear in the storefront automatically as soon as it has a price
   set — don't require a second manual "list it" step once both conditions
   are true.

**Revisions vs. editions**, once a workbook is live and a mistake is found:

- A **revision** is a same-edition fix — wording, an answer, an illustration
  parameter — that doesn't change the book's shape. Whether an edit qualifies
  should mostly be decided by machine, not by the admin's judgment call every
  time: if lesson count and chapter count are unchanged and no lesson or
  chapter was removed, allow it as a revision. Give the admin an override to
  force a new edition anyway if they want to market a small change as a real
  update, but don't make classification a manual step by default.
- Anything that *does* change lesson/chapter count, or removes content,
  should be forced into a **new edition** rather than a revision.
- Parents on an existing revision should see a new revision transparently on
  any lesson they haven't started — no prompt, since revisions are meant to
  be safe, same-scope fixes. Parents on an older edition should keep seeing
  that edition, with a UI flag that a new edition exists and a free,
  opt-in upgrade action.
- **This is already built — reuse it, don't rebuild it.** Confirmed directly
  in `app/ts-backend/src/services/native-workbooks.ts`:
  `prepareNativeWorkbookReplacement` / `completeNativeWorkbookReplacement` is
  today's revision path (same `editionId`, `versionNumber` and
  `revisionNumber` both bump). `prepareNativeWorkbookEdition` /
  `completeNativeWorkbookEdition` is today's new-edition path (new
  `editionId`, draft status, `supersedesVersionId` set to the previous active
  version). Progress already snapshots the specific version it was recorded
  against — `student_workbook_unit_progress` keys on
  `(profileId, nativeWorkbookVersionId, sourceUnitId)`, not just a workbook
  id. And the "started or downloaded → stay put" rule is already
  implemented, not just designed: `upgradeNativeWorkbookEditionForLearningYear`
  preserves a weekly-plan item on its old version if that week's status is
  `in_progress`/`completed` *or* it has any row in
  `weekly_plan_download_events` — matching Eric's rule exactly (started, or
  merely downloaded, both lock it). `student_workbook_edition_unit_carryovers`
  already exists as the reconciliation table for mapping a unit forward from
  an old version/edition to the new one. All of this should be extended to
  work against the new structured content model, not reimplemented — the gap
  isn't the edition/revision or progress-pinning logic, it's that today's
  version is: (a) built around an opaque uploaded PDF rather than structured
  content, and (b) the revision-vs-edition choice is a fully manual admin
  action (two separate upload flows) with no auto-classification, since
  there's nothing structured to diff yet. Once lesson/chapter content is
  structured, add a smart default suggestion (auto-detect "significant" via a
  lesson/chapter-count diff) on top of the existing manual choice — keep the
  override, don't remove it.

## Reuse the `/admin/funnels` editor pattern, not its content types

The closest existing precedent for the no-code editor isn't hypothetical —
it's already shipped, in `app/ts-frontend/app/admin/funnels/funnel-page-studio.tsx`
plus its schema (`funnel_pages`, `funnel_page_revisions`,
`funnel_page_generation_runs`). Structurally, it's solving the same problem:
a typed content tree (there: sections → rows → columns → elements; here:
chapters → lessons → learn blocks/exercises), edited through a canvas where
clicking any node selects it, a generic inspector panel that swaps its
controls based on the selected node's `type`, and an immutable
`mutate(draft => ...)` update-and-save flow. `funnel_page_revisions` already
does versioned JSON content with a `source` field distinguishing a manual
edit from an AI-generated one, and `funnel_page_generation_runs` already
tracks an AI generation as a logged run — provider, model, the prompt sent,
token usage, and which revision number it produced. That run-log shape is
exactly what workbook-generation jobs should look like too.

Two things NOT to carry over, though. First, the actual content vocabulary —
hero/split/offer sections, heading/button/list/countdown/image elements — is
marketing-page-specific and irrelevant here; workbook content needs its own
type vocabulary (the exercise/illustration types described above), not a
reuse of funnel section kinds. Second, and more importantly: funnel pages
render as live web pages with no print requirement at all, so nothing about
that rendering path transfers — the print-fidelity constraint below has no
equivalent in the funnels tool and needs its own solution. Treat this as
"reuse the editor scaffolding and the revision/generation-run schema shape,"
not "reuse the page-builder or its renderer."

One more note worth flagging directly: `funnel_page_generation_runs.provider`
is currently `"google"` in production usage, not Anthropic. That's a real
signal, not an assumption — confirmed by grepping the current
`funnels.ts` service. Whatever gets built for workbook generation needs its
own, explicit Claude/Anthropic provider path; don't inherit the funnel
tool's existing provider default.

## Hard constraint: the printed output cannot change

Parents download PDFs. The visual design — typography, spacing, the specific
look of exercises, matching tables, answer-key pages, running headers, TOC with
resolved page numbers — has been iterated on across a large catalog and is not
up for revision as part of this migration. A PDF generated from the new
in-platform model must be visually indistinguishable from what the current
local pipeline produces.

Treat these as the reference spec for what "faithful" means, all in the
`treeschool-workbooks` repo:

- `workbook-templates/workbook-template-v1/` — the base HTML/CSS template
  every book is built from (cover, TOC, chapter dividers, lesson layout,
  answer-key-page layout, print `@page` rules, running headers via
  `string-set`/`string()`, TOC page numbers via `target-counter()`).
- `prompts/math/math-template-overlay.html` and any sibling `*-template-overlay.html`
  files — reusable CSS classes + inline-SVG patterns for subject-specific
  illustrations (shape figures, fraction diagrams, clock faces, bar/picture
  graphs). These are parameterized-in-spirit already; see "illustrations"
  below.
- `workbook-content/*/workbook.html` — already-shipped, already-QC'd books
  (Science, Social Studies, Spelling, Writing & Grammar, Math, four Reading
  levels, four Kokugo books) — these are ground truth for "correct output,"
  not hypothetical examples.
- The render step depends on Paged.js actually running (not just Chrome's
  native print-to-PDF) for TOC page numbers and running headers to resolve —
  whatever renders the PDF server-side needs to account for this the same way
  the local Playwright+Paged.js step does.

## What's already in the schema — decide how the new model relates to it

Two existing structures are relevant and possibly in tension; figure out which
one the new content model should extend, replace, or sit alongside:

- `native_workbooks` / `native_workbook_editions` / `native_workbook_versions`
  / `native_workbook_jobs` — the current "upload a PDF, analyze it" pipeline,
  already versioned/edition-aware at the workbook level. This is probably the
  right place to hang a "published, print-ready artifact" concept even after
  the migration, since editions/versions/purchases/download-links already key
  off of it.
- `lessons` (with `promptJson` and `contentJson` jsonb columns, plus
  `lessonGenerationJobs`) — there's already a precedent elsewhere in the
  platform for AI-generated, structured, per-lesson JSON content keyed to a
  `curriculumNodes` node. This is much closer in shape to what we want for
  workbook lessons than the PDF-upload path is.
- `curriculumNodes`, `skills`, `lexicon` / `studentVocabulary` / `nodeKeywords`
  — there's already a vocabulary/skill-tagging system in the platform. The
  local pipeline has its own parallel version of this (a deterministic
  vocabulary-gate script at `scripts/vocabulary/check_word.py`, run against a
  grade-level lexicon before finalizing any curriculum/outline/lesson-title
  term). These should probably converge — don't build a second, disconnected
  vocabulary system if the platform's `lexicon` tables can serve both.

## Content model shape (adapt as needed — this is the shape, not a schema)

Whatever you land on, it needs to represent, per lesson: an ordered list of
"learn" blocks (paragraph text, or an illustration reference) and an ordered
list of exercises, where each exercise has a `type` (circle-choice, multiple-
choice, matching, fill-in-blank, short-answer/write, draw-box), whatever
fields that type needs (options, a matching left/right pair list with its
scramble pattern, etc.), a `correctAnswer`, and a `standardsCode` (e.g.
`2.OA.A.1`) or equivalent skill tag.

**Illustrations are the one part of this that needs a real design decision,
not just a straight port.** Today they're hand-authored inline SVG — some
reused from a fixed per-subject pattern library (clock faces, fraction
diagrams, shape icons, bar/picture graphs), some bespoke one-offs built for a
specific lesson (e.g. a line-plot diagram and a rectangle-partition grid built
this session, because nothing in the library covered them yet). Raw embedded
SVG is a bad fit for a no-code editor and a worse fit for constraining what an
LLM can generate wrong. Illustrations should be a registry of parameterized
diagram types (`clock: {hour, minute}`, `bar_graph: {categories, values,
unitLabel}`, `fraction: {parts, shaded}`, etc.), rendered server-side into the
exact same SVG markup/CSS classes the overlay files already define, with a
raw-SVG escape hatch for genuinely novel one-offs. New diagram types will keep
appearing as new subjects get built — design for that registry to grow, not
be fixed at launch.

## Validation — two tiers, matching what the local pipeline already enforces by hand

The local pipeline currently catches real bugs via a BeautifulSoup structural
check (exercise-count parity, answer-key parity, TOC hrefs matching lesson
ids) plus a rendered-PDF visual spot-check (every illustration present, no
adjacent-repeat matching-table scrambles, bar/line graphs have real axis
ticks not just captions, fraction diagrams paired with a numeral not just a
word label). Split this into:

- **Save-time validation** on individual components (a matching exercise has
  equal left/right arrays, a fill-blank has a non-empty answer, etc.) — so a
  bad edit in the no-code editor can't corrupt a live lesson.
- **Publish-time validation** across a whole book (scramble-pattern variety,
  every lesson flagged as needing an illustration actually has one, page/
  chapter counts are sane) — mirroring the local pipeline's pre-ship QC,
  running automatically before a new edition/version is marked publishable,
  not as a manual step.

## Explicitly out of scope for this pass

- **Third-party AI clipart generation.** Cover images and any future
  decorative artwork are a separate, still-being-designed system (a
  procedural clipart *style* fed into a paid third-party image-generation
  API). Don't build that integration now. Do leave room for it: an "image
  asset" component type with a text description field and a placeholder
  action slot (so a future "generate" button has somewhere to attach) is
  enough — avoid a schema migration later for something we can see coming
  now.
- **Backfilling already-shipped books** into the new structured model. They're
  stable, already QC'd, and not being revised — migrate opportunistically
  later if ever, not as part of this work.
- **Changing the print design.** This migration is about where content lives
  and how it's authored/edited, not a redesign.

## Open questions worth resolving with Eric before or during implementation

- Does the "publish" step produce a new `native_workbook_version` row (PDF +
  `objectPath`) the same way an uploaded PDF does today, so the rest of the
  purchase/download/edition machinery doesn't need to change? (Recommended,
  but confirm.)
- Should the existing `lessons`/`lessonGenerationJobs` tables be generalized
  to cover workbook lessons too, or should workbook content get its own
  parallel tables that happen to share the same shape? Either is defensible;
  pick based on how entangled `lessons` already is with the per-student
  lesson-delivery system versus the per-workbook authoring system.
