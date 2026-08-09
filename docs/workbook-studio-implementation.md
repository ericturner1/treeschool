# Workbook Studio implementation and operations

Workbook Studio is the in-platform authoring system under `/admin/workbook-studio`.
It stores workbook content, generation configuration, visual themes, validation
rules, and render artifacts as versioned records. Existing shipped PDF-only
workbooks remain supported and are not rewritten by this implementation.

## Content compatibility rule

An edition is the learning structure a student is assigned to. A revision is a
correction to that same structure.

- Each lesson has a stable ID that is independent of its title, wording, or PDF
  page number.
- If a replacement has the exact same set of stable lesson IDs, it can be a
  same-edition revision. Text can reflow and the PDF page count can change.
- Adding a lesson, deleting a lesson, or replacing one stable lesson ID with
  another requires a new edition.
- Changing the effective theme version also requires a new edition.
- Legacy PDF-only replacements retain the older page-based compatibility
  analysis until they are deliberately converted to structured content.

This keeps students pinned safely without treating harmless pagination changes
as curriculum changes.

## Main records

- `workbook_curricula` and `workbook_curriculum_revisions` hold a grade-level
  catalog plan before any books are generated.
- `workbook_projects` is the authoring object. It can exist without a bookstore
  product, price, or public listing.
- `workbook_content_revisions` stores immutable typed content trees and their
  stable-lesson fingerprint.
- `workbook_generation_prompts` and their immutable versions store reusable
  workflows, stage prompts, subject overlays, and layout instructions imported
  from the historical prompt library or authored in admin.
- `workbook_generation_rules` and their immutable versions store independently
  editable quality policy. Prompt-enforced rules are assembled into AI calls;
  mechanically enforceable rule parameters feed structured validation.
- `workbook_themes` and `workbook_theme_versions` store structured tokens.
  Assignments always point to a published version, never to an unversioned theme.
- `workbook_illustration_types` is the growing parameterized illustration
  registry. SVG theme placeholders are resolved to literal colors on the server
  before Chromium sees the document.
- `workbook_generation_batches`, `workbook_generation_runs`,
  `workbook_studio_jobs`, and `workbook_render_runs` follow the existing claimed
  job pattern with attempts, availability, heartbeats, worker IDs, and errors.

The schema is introduced by
`supabase/migrations/20260809130000_workbook_studio_foundation.sql`.

## Generation workflows

Single-workbook generation uses one queue sequence:

1. curriculum brief
2. lesson outline
3. structured lesson content
4. deterministic validation
5. deterministic HTML/PDF render

A reusable workflow version can pin exact stage-prompt and subject-overlay
version IDs in its configuration. Every run records the model, prompt version,
and applied rule-version IDs.

Grade-level generation is a wrapper, not a second content path:

1. AI creates a structured curriculum/catalog plan.
2. An admin reviews, edits, and publishes that plan.
3. The admin explicitly starts generation.
4. The batch creates one authoring project per stable catalog-plan key and sends
   each project through the normal single-workbook pipeline.

Fan-out is idempotent for a curriculum and stable catalog-plan key, so retrying
does not overwrite an existing authoring project.

## Themes and edition cascades

The seeded Classic theme was extracted from the canonical template and subject
overlays in the sibling `treeschool-workbooks` repository. V1 exposes structured
color, typography, spacing, and component-token fields. The reserved raw CSS
column is intentionally unused.

Theme resolution order is:

1. the project's published `themeOverrideVersionId`, when present;
2. the curriculum's published `defaultThemeVersionId`;
3. the seeded published Classic theme for a standalone project.

Changing a curriculum default queues a theme-cascade edition for every released
project that inherits that default. Changing a released project override queues
an edition for that project. Re-selecting the already-effective version is a
no-op. Draft projects simply use the new assignment on their next render.

## Rendering

Rendering is self-contained and does not load network resources:

- Playwright Chromium is pinned in the backend package and installed in the
  backend image.
- Paged.js is pinned and inlined into the render HTML.
- Nunito, Comic Neue, and Noto Sans JP packages are pinned and their font bytes
  are inlined.
- Canonical template CSS and the Math, Japanese, and Music overlays are bundled
  with the backend image.
- A4 dimensions, print background, page mechanics, cover styling, and the
  generated PDF are checked in the renderer tests.

Render runs retain the renderer, Chromium, Paged.js, font, theme-version,
content-revision, HTML-object, PDF-object, and page-count metadata needed to
reproduce or audit a release.

## Authoring versus bookstore publication

Workbook authoring and bookstore catalog concerns are deliberately separated.
A project can be drafted, generated, reviewed, validated, and rendered without
creating a `native_workbooks` row or inventing temporary price data.

The first release asks for the real catalog description, curriculum area,
core/elective type, price, currency, tags, and optional prerequisite. Only then
does Workbook Studio create and link the native bookstore record. Later releases
reuse the existing replacement/edition machinery and the existing student
edition pinning and carryover behavior.

## Deployment checklist

1. Install the Bun workspace dependencies so the exact lockfile versions are
   used.
2. Build the backend image from `Dockerfile.backend`; its Playwright install step
   installs Chromium and the required operating-system packages.
3. Apply Supabase migrations, including
   `20260809130000_workbook_studio_foundation.sql`.
4. Import the historical reusable prompt library from the sibling repository:

   ```sh
   bun run workbook-studio:import-prompts
   ```

   The importer is content-hash idempotent. Use
   `TREESCHOOL_WORKBOOKS_PATH=/absolute/path/to/treeschool-workbooks` when the
   sibling repository is not in its default location.

5. Configure `ANTHROPIC_API_KEY`. `WORKBOOK_STUDIO_MODEL` is optional and defaults
   to the pinned model recorded by the generation provider.
6. Run the normal backend task worker. It claims Workbook Studio jobs before
   continuing to the legacy native-workbook queue.
7. Open `/admin/workbook-studio`, confirm the Classic theme and imported prompt
   versions, and run a manual smoke render before enabling AI generation.

## Separate legacy migration phase

Bulk reconciliation of already-shipped shared-folder PDFs is intentionally not
part of this implementation. The follow-up procedure and acceptance gates are in
`docs/workbook-studio-legacy-pdf-reconciliation.md`.
