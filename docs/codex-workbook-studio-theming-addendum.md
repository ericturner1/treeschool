# Workbook Studio Addendum: Themes (the "template" concept)

## Relationship to the base doc

This supplements `docs/codex-workbook-studio-prompt.md` — read that file first if
you haven't. It covers one thing the base doc left implicit: **the base doc
treats "template" as a single fixed constraint (preserve current print output
exactly), not as a first-class, admin-manageable concept.** Eric wants the
latter: the ability to define a common look and feel once and reuse it across
many workbooks, with room for more than one such look-and-feel to exist later.

**Naming: call this a "Theme," not a "Template," inside the app/schema/UI.**
"Template" is already overloaded in this codebase and in the base doc — the
`workbook-templates/workbook-template-v1/` folder, the base-doc's "stage
prompts" (which are themselves prompt *templates*), and `funnel_pages`'
own template concept all use the word for something else. "Theme" is the
closer analogy anyway (a swappable visual/typographic system, the same idea
as a CMS or site-builder theme) and won't collide with those other uses in
conversation or in code. The rest of this doc uses "theme."

## What a theme actually is today (ground truth, extracted directly from the files)

There is currently exactly one theme, and it isn't modeled as an object at
all — it's hardcoded across `workbook-templates/workbook-template-v1/treeschool-workbook-template.html`
(833 lines: inline `<style>` block + the front-matter HTML skeleton) and
consumed by every subject overlay (`prompts/math/math-template-overlay.html`,
`prompts/foreign-language/japanese-template-overlay.html`,
`prompts/music/music-template-overlay.html`, and their `prompts/english/`
counterparts). Concretely, a theme needs to own all of the following, because
this is everything the current single theme actually specifies:

**Design tokens** — defined once as CSS custom properties on `:root` and
referenced everywhere else via `var(...)`, never repeated as raw hex:
```css
--ink:#25201B;      /* primary text */
--earth:#8F6544;     /* secondary/muted text, footer, badges */
--leaf:#739E56;      /* accent, borders, header rule */
--leaf-dark:#567B40;  /* headings */
--cream:#FFFAF2;
--sand:#F6EDDC;      /* cover background fill */
--canvas:#FFFFFF;    /* page background */
```
Plus a cover-specific accent color used directly as hex in a few cover-only
spots (`#2F6690`, the header/edition bars and grade badge) that isn't
currently promoted to a `:root` token — decide whether to fix that gap as
part of theming this (it should be a token; it just never needed to be one
when there was only ever one theme).

**Typography** — two font roles, not one: `"Comic Sans MS","Comic Sans",cursive`
for all headings (`h1-h4`, the logo wordmark, chapter titles, part labels,
answer-key banner) and `"Avenir Next","Nunito","Trebuchet MS","Segoe UI",sans-serif`
for body text and running headers/footers. Base body size is `13pt` /
`line-height: 1.5`. A theme needs to own both roles as separate settings, not
one "font family" field.

**Page chrome** — `@page` rules: page size (`A4`), margins
(`16mm 14mm 20mm 14mm`, with a distinct smaller margin on `@page :first` for
the cover), and the running header/footer content driven by Paged.js
`string-set`/`string()`/`target-counter()` — page number bottom-right, "Treeschool
— {subject}" bottom-left, current chapter top-left, current lesson top-right.
This is print-mechanical as much as it is visual (see "Non-negotiable print
mechanics" below) — a theme can restyle the chrome's typography/color but must
not break the counter/string-set wiring itself.

**Core component styles**, i.e. every structural piece a workbook is built
from regardless of subject: cover (header bar, edition bar, grade corner
badge, optional cover-symbol image slot with its `onerror` fallback,
core-curriculum pill), publisher/copyright page, table of contents (bordered
box, dotted chapter-header rule, `target-counter` page links), chapter divider
page, lesson box (bordered rounded container, lesson-title rule, part-label,
intro paragraphs, exercises list, options list, inline `.blank`, multi-line
`.write-space`/`.write-line`, `table.matching`), and the dedicated answer-key
page (banner, dashed-border answer box). All of these are already CSS classes
scoped to reusable names (`.cover`, `.toc`, `.lesson`, `.answer-key-page`,
etc.) — a theme is, structurally, a full reskin of this exact class list, not
a different concept.

**Known structural variants within "one" theme today** — worth knowing before
you design the schema, since it means a theme isn't purely flat CSS: reader
workbooks have no chapter concept at all (`@top-left` stays empty for the
whole book; only `@top-right`, the story title, is used) and get a
`vocab-summary` page type the standard chapter/lesson books don't have. A
theme (or a theme applied to a given workbook *type*) needs to account for
this, not assume every workbook uses the full chapter→lesson→answer-key
structure.

## How this relates to subject overlays — keep them orthogonal

Subject overlays (math, foreign-language/kanji, music) are a different axis
from theme, and should stay that way. An overlay adds *new component/diagram
vocabulary* for a subject (a clock face, a fraction bar, a char-grid table
with stroke-order columns) — it does not redefine the color palette or
typography. Confirmed directly in the files: `math-template-overlay.html` and
`japanese-template-overlay.html` both reference the base template's tokens via
`var(--leaf)`, `var(--ink)`, `var(--earth)` rather than hardcoding their own
colors — they're already written as theme-consumers, not theme-definers. Keep
that contract in the new system: an overlay's components should always pull
color/type from whatever theme is currently active, so switching a workbook's
theme re-skins its subject-specific diagrams too, automatically, without the
overlay itself needing to change.

**One real tension to solve, not paper over:** inline SVG illustrations
(clock faces, fraction diagrams, stroke-order arrows, bar graphs) currently
hardcode hex color values rather than using `var()`, because `var()` support
inside SVG attributes is inconsistent across this print pipeline (this is
already stated as a deliberate rule in `general_step3_workbook_generation_prompt.md`).
That means today's SVG illustrations are *not* actually theme-portable,
despite living in files that otherwise behave like theme-consumers. Since the
new system renders illustrations server-side from the parameterized registry
the base doc describes (not hand-authored HTML), you have a real fix
available that the old pipeline didn't: resolve the active theme's token
values server-side at render time and bake the resolved hex into the
generated SVG at that point, rather than relying on browser-side `var()`
resolution inside SVG. Decide and document this explicitly — don't let it
stay an implicit gap the way it is today.

## Data model (shape, not schema — same spirit as the base doc)

A `WorkbookTheme` (or whatever you name the table) needs to carry, at
minimum: an id/name/version and a status (draft/published, mirroring how
`funnel_page_revisions` versions content); the design tokens above as
**structured fields — not a raw CSS blob.** Concretely: a small, fixed set of
typed inputs (a color field per token — text, accent, heading, background; a
font-stack picker per role — heading, body; the page-chrome numbers — size,
margins) that render as real UI controls (color pickers, font dropdowns) in
the no-code editor, the same way any other typed field in this system works.
Resolve those fields into one concrete, versioned stylesheet per published
theme version at generation/render time — a compiled artifact, not something
re-resolved on every single PDF render.

**Skip the raw-CSS escape hatch for v1.** A free-text CSS override is the
more flexible option, but flexibility here is a liability, not a feature: it
would let an admin trivially violate the non-negotiable print mechanics below
(break rules, split-fragment fixes, string-set wiring) with no way for
publish-time validation to catch it short of re-deriving intent from
arbitrary CSS, and it reopens the exact "reverse-engineer structure from an
opaque artifact" problem the base doc's whole migration is meant to close.
Structured token fields are also the actual shape of the real request — one
common look and feel, reused across workbooks — not a request for per-book
bespoke layouts. If a genuinely new layout idea shows up later that the token
set can't express, that's a signal to add a new theme *type* or extend the
token schema deliberately, not to bolt on an unconstrained override. Leave
room for it in the schema (an unused `rawCssOverride` column costs nothing to
reserve) but don't build the editor affordance or the render-time support for
it now.

**Theme selection is curriculum-level by default, with an optional
per-workbook override.** `Curriculum` carries the primary `themeId`; a
`Workbook` has a nullable `themeIdOverride` that, when set, wins. Resolve
effective theme as `workbook.themeIdOverride ?? curriculum.themeId`. Default
every existing/new curriculum to the one seeded base theme (see Migration
below) so nothing regresses by omission.

**A theme change always produces a new edition, never a revision — this
overrides the base doc's lesson/chapter-count-based auto-classification for
this one case.** That auto-classification (same lesson/chapter count →
revision; anything else → edition) governs *content* edits; it has nothing to
say about a purely visual change, and a visual change is exactly the kind of
thing a parent mid-workbook shouldn't have silently rewritten under them. Wire
this into the same edition machinery the base doc already points at
(`prepareNativeWorkbookEdition`/`completeNativeWorkbookEdition`,
opt-in upgrade, existing-progress pinning) rather than inventing a separate
path for theme-only changes — a theme swap just happens to touch zero
lesson/chapter content while still being edition-worthy. Practical
consequence worth designing for up front: changing a *curriculum's* default
theme should cascade as a new-edition bump across every workbook in that
curriculum, as a batch job (reuse the same job-queue shape as grade-level
generation, per the base doc), not a manual per-workbook action — an admin
picking a new curriculum-wide look shouldn't have to trigger N separate
edition bumps by hand. A per-workbook `themeIdOverride` change, by contrast,
only bumps that one workbook.

## Non-negotiable print mechanics — these are not theme-editable

A theme changes look, not correctness. The following stay fixed regardless of
which theme is active, and any theme (including future ones an admin defines)
must still satisfy them — treat this as a validation contract, not a
convention someone has to remember:

- Every forced page-break transition owns exactly one `page-break-before`/
  `page-break-after` declaration (never both sides of the same transition —
  see the base template's own comment on why Paged.js can't collapse a
  double-declared break).
- Every table row needs `break-inside: avoid; page-break-inside: avoid;`, and
  every table header row additionally needs `break-after: avoid;
  page-break-after: avoid;`.
- The split-fragment border fix (`[data-split-to]`/`[data-split-from]`
  stripping border/radius at the artificial cut edge) must be present for
  every bordered/rounded container a theme defines as capable of spanning a
  page break (`.lesson`, `.toc`, the answer-key box, and any equivalent a new
  theme introduces).
- The running-header `string-set` selectors must stay consolidated in one
  rule (Paged.js keeps only the last-declared `string-set` for a given
  identifier in the whole stylesheet — see the base template's own comment on
  this exact footgun). A theme that moves chapter/lesson-title markup around
  must update that consolidated selector list, not add a second scattered
  declaration.
- `target-counter(attr(href url), page)` TOC links must keep resolving real
  page numbers — never a theme that hardcodes or drops this.

Publish-time validation (per the base doc's validation section) should check
a theme against this list before it's usable, the same way content gets
validated before a workbook is publishable.

## Migration instruction — the seeded base theme(s) must match exactly

**This is the one hard requirement for this whole addendum: whatever theme(s)
you migrate in as the starting/default theme must look, read, and print
identically to what's in `treeschool-workbooks` today.** Don't recreate the
look by eyeballing rendered PDFs or approximating colors/fonts from memory —
extract the actual values directly from the source files:

- `workbook-templates/workbook-template-v1/treeschool-workbook-template.html`
  for every token, font stack, page-chrome rule, and component style listed
  above.
- `prompts/math/math-template-overlay.html`,
  `prompts/foreign-language/japanese-template-overlay.html`, and
  `prompts/music/music-template-overlay.html` (plus their `prompts/english/`
  duplicates — check whether those are genuinely identical copies or have
  drifted before treating either as canonical) for how overlay components
  consume the base tokens.
- A handful of already-shipped `workbook-content/*/workbook.html` files
  (Science, Social Studies, Math, the four Kokugo books, the four Reading
  levels) as rendered ground truth — same role they play in the base doc's
  own "hard constraint" section.

Name this seeded theme something like "Classic" or "Original" (Eric's call,
not yours to invent silently — ask if it's not obvious from context) and treat
it as immutable/reference-only in the UI, at least initially: it's the proof
that the new system reproduces old output, not a theme meant to be casually
edited. Verify parity the same way the base doc's own hard-constraint section
implies — render a workbook through the new system and compare it directly
against the current pipeline's output for the same source content, not just a
visual glance.

## Decisions (resolved with Eric — do not re-litigate these)

- **Theme is curriculum-level by default, with an optional per-workbook
  override.** See the `themeIdOverride` shape in Data model above. Subject-
  specific visual nuance within one curriculum (e.g. a Kokugo book's kanji
  panels vs. a Math book's fraction diagrams) stays in the overlay layer, as
  it already works today — overlays consume theme tokens, they don't need
  their own theme-level knob.
- **A theme change always requires a new edition**, never a silent revision —
  no exception for "it's just visual." See the edition-cascade behavior above.
- **Structured token fields, not a raw CSS escape hatch, for v1.** Reserve an
  unused `rawCssOverride` column in the schema in case it's needed later, but
  don't build the UI or render-time support for it now — see the reasoning
  in Data model above.
