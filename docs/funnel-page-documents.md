# Funnel page documents

Funnel steps own their page content. A live funnel page must not depend on a marketing page elsewhere in the application, because changing that external page would silently change a running funnel or experiment.

## Canonical document

The canonical page format is the versioned `FunnelPageDocument` in `app/ts-frontend/lib/funnels/page-document.ts`:

- document → sections → rows → columns → elements;
- layout is expressed through section width/tone and twelve-column spans;
- content elements include headings, text, lists, images, buttons, lead forms, and dividers;
- media elements retain a stable asset/storage reference, public URL snapshot, dimensions, and alternative text;
- buttons and forms use semantic funnel actions such as `next_step`, `checkout`, `accept_offer`, and `decline_offer` rather than knowing the URL of the following page.

This JSON tree—not generated HTML—is the source of truth. The public renderer and the dedicated full-screen page editor both consume the same document. The editor lives outside the funnel journey workspace at `/admin/funnels/{funnel}/pages/{step}/edit`, so journey management stays compact while page editing can grow into a complete drag-and-drop experience without changing stored pages or the public renderer contract.

## Revision and publication rules

`funnel_pages` represents a page identity. `funnel_page_revisions` contains immutable content and SEO snapshots. Saving creates a new revision; it does not alter a published revision. Publishing moves the page's published revision pointer deliberately. This keeps live funnels and A/B variants stable while a draft is edited.

A funnel step may have one primary page and additional variant pages. An A/B routing container does not own content; its child variants each own a real page document.

## Existing code-backed pages

Legacy `source_type` and `source_ref` columns remain temporarily for compatibility with funnels that predate managed pages. They are no longer exposed as the page-authoring model.

Known authored landing, sales, upsell, and downsell pages have deterministic importers in `app/ts-frontend/lib/funnels/legacy-page-imports.ts`. The first time an administrator opens one in the page editor, Treeschool creates an `imported` CMS revision containing its copy, structure, media references, actions, and SEO. Importing is deliberately non-destructive: the legacy source identity and public URL remain authoritative while the CMS page is only a draft. An ordinary edit makes the managed document the pending source, and an explicit Publish action assigns the stable `/f/{funnel}/{step}` route.

Routing containers, embedded order-choice interactions, external checkout destinations, and runtime fulfillment screens are not content pages and are not imported. The funnel editor explains where those steps are managed rather than presenting a misleading blank page editor.

## Editor and renderer invariants

- Every section, row, column, and element has a stable ID.
- A non-final active page must contain a forward semantic action or the funnel editor flags it as a dead end.
- AI generation produces a reviewable document revision and never publishes automatically.
- Images are rendered from the media snapshot stored in the revision, not discovered from another page at runtime.
- Editor uploads live under the dedicated `funnel-assets/{funnelId}/{stepId}/` storage namespace. A revision retains its immutable media snapshot even after newer page revisions are created.
- SEO data is revisioned with the page content.
- Unknown future document versions must be migrated explicitly rather than interpreted as HTML.
