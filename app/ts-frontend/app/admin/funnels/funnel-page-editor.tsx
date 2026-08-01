import type {
  AdminFunnelStep,
  AdminManagedFunnelPagePayload,
  ManagedFunnelPageContent
} from "../../../lib/funnels/server";
import {
  createFunnelPageVariantAction,
  generateFunnelPageAction,
  publishFunnelPageAction,
  saveFunnelPageDraftAction,
  unpublishFunnelPageAction
} from "./actions";
import { FunnelSubmitButton } from "./funnel-submit-button";

function defaultTemplate(step: AdminFunnelStep): ManagedFunnelPageContent["template"] {
  if (step.stepType === "upsell") return "upsell";
  if (step.stepType === "downsell") return "downsell";
  if (step.stepType === "thank_you" || step.stepType === "fulfillment") return "thank_you";
  if (step.stepType === "redirect" || step.stepType === "checkout") return "bridge";
  return "sales";
}

function titleCase(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function FunnelPageEditor({
  funnelId,
  funnelSlug,
  step,
  data
}: {
  funnelId: string;
  funnelSlug: string;
  step: AdminFunnelStep;
  data: AdminManagedFunnelPagePayload;
}) {
  const page = data.page;
  const content: ManagedFunnelPageContent = page?.content ?? {
    template: defaultTemplate(step),
    theme: "sage",
    eyebrow: "",
    headline: step.name,
    subheadline: step.description,
    body: "",
    bullets: [],
    primaryCtaLabel: "Continue",
    primaryCtaHref: null,
    secondaryCtaLabel: null,
    secondaryCtaHref: null,
    reassurance: "",
    leadCapture: {
      enabled: false,
      heading: "Where should we send it?",
      collectFirstName: true,
      firstNameLabel: "First name",
      emailLabel: "Email address",
      submitLabel: "Continue"
    }
  };
  const publishedRevision = page?.publishedRevisionNumber ?? null;
  const hasUnpublishedChanges = Boolean(
    page && publishedRevision !== page.latestRevisionNumber
  );
  const previewPath =
    `/admin/funnels/${encodeURIComponent(funnelSlug)}/preview/${encodeURIComponent(step.id)}` +
    (page ? `?page=${encodeURIComponent(page.id)}` : "");

  return (
    <section className="border-t border-[#eadbc5] bg-[#fbf6ed] px-5 py-6 sm:px-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.12em] text-[#567b40]">
            Managed page
          </p>
          <h3 className="mt-1 text-2xl font-semibold tracking-[-0.04em]">
            {page?.name ?? "Page content and publishing"}
          </h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-ink/58">
            Every save creates an immutable draft revision. Nothing public changes
            until you explicitly publish the latest draft.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
            page?.status === "published"
              ? "bg-[#dfeecf] text-[#456332]"
              : "bg-[#eee7dc] text-ink/55"
          }`}>
            {page?.status === "published" ? "Published" : "Draft only"}
          </span>
          {page ? (
            <span className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-ink/55">
              Revision {page.latestRevisionNumber}
            </span>
          ) : null}
          {hasUnpublishedChanges ? (
            <span className="rounded-full bg-[#f6e7c8] px-3 py-1.5 text-xs font-semibold text-[#7b5d2e]">
              Unpublished changes
            </span>
          ) : null}
        </div>
      </div>

      {data.pages.length > 0 ? (
        <div className="mt-6 flex flex-wrap items-center gap-2 rounded-[18px] border border-[#ded3c3] bg-white p-3">
          {data.pages.map((candidate) => (
            <a
              key={candidate.id}
              href={`/admin/funnels/${encodeURIComponent(funnelSlug)}?step=${encodeURIComponent(step.id)}&page=${encodeURIComponent(candidate.id)}`}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                candidate.id === page?.id
                  ? "bg-[#567b40] text-white"
                  : "bg-[#f2ece2] text-ink/60 hover:bg-[#e8dfd1]"
              }`}
            >
              {candidate.name}{candidate.isPrimary ? " · Control" : ""}
            </a>
          ))}
          {page ? (
            <form action={createFunnelPageVariantAction} className="ml-auto flex items-center gap-2">
              <input type="hidden" name="funnelId" value={funnelId} />
              <input type="hidden" name="funnelSlug" value={funnelSlug} />
              <input type="hidden" name="stepId" value={step.id} />
              <input type="hidden" name="pageId" value={page.id} />
              <input
                name="name"
                aria-label="New variant name"
                placeholder="Variant name"
                className="ts-input !w-40 !px-3 !py-2 text-sm"
              />
              <FunnelSubmitButton
                label="Duplicate as variant"
                pendingLabel="Duplicating…"
                tone="outline"
              />
            </form>
          ) : null}
        </div>
      ) : null}

      <details className="mt-6 rounded-[20px] border border-[#c9c2df] bg-[#f5f1fa]">
        <summary className="cursor-pointer list-none px-5 py-4 marker:hidden">
          <span className="text-xs font-black uppercase tracking-[0.12em] text-[#665481]">
            AI writing assistant
          </span>
          <span className="mt-1 block text-lg font-semibold">
            Create or improve this page from a prompt
          </span>
        </summary>
        <form action={generateFunnelPageAction} className="grid gap-5 border-t border-[#d7cce5] p-5">
          <input type="hidden" name="funnelId" value={funnelId} />
          <input type="hidden" name="funnelSlug" value={funnelSlug} />
          <input type="hidden" name="stepId" value={step.id} />
          <input type="hidden" name="pageId" value={page?.id ?? ""} />
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-semibold">
              What should AI do?
              <select
                name="mode"
                defaultValue={page ? "rewrite" : "create"}
                className="ts-input"
              >
                {!page ? <option value="create">Create the first page</option> : null}
                {page ? <option value="rewrite">Rewrite this page</option> : null}
                {page ? <option value="optimize">Improve this page conservatively</option> : null}
                {page ? <option value="variant">Create a new A/B variant</option> : null}
              </select>
            </label>
            <label className="grid gap-2 text-sm font-semibold">
              New variant name <span className="font-normal text-ink/45">(only used for A/B variants)</span>
              <input
                name="variantName"
                placeholder="Benefit-led headline"
                className="ts-input"
              />
            </label>
          </div>
          <label className="grid gap-2 text-sm font-semibold">
            Instructions
            <textarea
              name="prompt"
              required
              minLength={10}
              rows={5}
              placeholder="Example: Make the headline clearer for parents who want a complete first-grade curriculum without putting their child on a screen. Preserve the price and factual product details."
              className="ts-input resize-y"
            />
          </label>
          <div>
            <FunnelSubmitButton
              label="Generate reviewable draft"
              pendingLabel="Writing draft…"
            />
            <p className="mt-3 text-xs leading-5 text-ink/48">
              AI output is saved as a new draft revision. It is never published automatically.
            </p>
          </div>
        </form>
      </details>

      <form action={saveFunnelPageDraftAction} className="mt-6 grid gap-5">
        <input type="hidden" name="funnelId" value={funnelId} />
        <input type="hidden" name="funnelSlug" value={funnelSlug} />
        <input type="hidden" name="stepId" value={step.id} />
        <input type="hidden" name="pageId" value={page?.id ?? ""} />

        <div className="grid gap-5 sm:grid-cols-2">
          <label className="grid gap-2 text-sm font-semibold">
            Page type
            <select name="template" defaultValue={content.template} className="ts-input">
              {data.templates.map((template) => (
                <option key={template} value={template}>{titleCase(template)}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-2 text-sm font-semibold">
            Visual theme
            <select name="theme" defaultValue={content.theme} className="ts-input">
              {data.themes.map((theme) => (
                <option key={theme} value={theme}>{titleCase(theme)}</option>
              ))}
            </select>
          </label>
        </div>

        <label className="grid gap-2 text-sm font-semibold">
          Eyebrow
          <input
            name="eyebrow"
            defaultValue={content.eyebrow}
            placeholder="A short lead-in above the headline"
            className="ts-input"
          />
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          Headline
          <input name="headline" required defaultValue={content.headline} className="ts-input" />
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          Subheadline
          <textarea
            name="subheadline"
            rows={2}
            defaultValue={content.subheadline}
            className="ts-input resize-y"
          />
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          Body copy
          <textarea
            name="body"
            rows={6}
            defaultValue={content.body}
            placeholder="Separate paragraphs with a blank line."
            className="ts-input resize-y"
          />
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          Key points
          <textarea
            name="bullets"
            rows={5}
            defaultValue={content.bullets.join("\n")}
            placeholder={"One point per line\nPrintable and paper-first\nNo long-term commitment"}
            className="ts-input resize-y"
          />
        </label>

        <div className="grid gap-5 rounded-[20px] border border-[#ded3c3] bg-white p-5 sm:grid-cols-2">
          <label className="grid gap-2 text-sm font-semibold">
            Primary button label
            <input name="primaryCtaLabel" required defaultValue={content.primaryCtaLabel} className="ts-input" />
          </label>
          <label className="grid gap-2 text-sm font-semibold">
            Primary button destination
            <input
              name="primaryCtaHref"
              defaultValue={content.primaryCtaHref ?? ""}
              placeholder="Leave blank to continue to the next active step"
              className="ts-input"
            />
          </label>
          <label className="grid gap-2 text-sm font-semibold">
            Secondary button label
            <input name="secondaryCtaLabel" defaultValue={content.secondaryCtaLabel ?? ""} className="ts-input" />
          </label>
          <label className="grid gap-2 text-sm font-semibold">
            Secondary button destination
            <input
              name="secondaryCtaHref"
              defaultValue={content.secondaryCtaHref ?? ""}
              placeholder="/pricing or https://…"
              className="ts-input"
            />
          </label>
          <label className="grid gap-2 text-sm font-semibold sm:col-span-2">
            Reassurance beneath the buttons
            <input
              name="reassurance"
              defaultValue={content.reassurance}
              placeholder="Secure checkout · Cancel anytime"
              className="ts-input"
            />
          </label>
        </div>

        <details className="rounded-[20px] border border-[#b9cfa5] bg-[#f3f8ee]">
          <summary className="cursor-pointer list-none px-5 py-4 font-semibold marker:hidden">
            Lead capture form
            <span className="ml-2 text-xs font-normal text-ink/48">
              Optional email opt-in before the primary destination
            </span>
          </summary>
          <div className="grid gap-5 border-t border-[#cfddc1] p-5 sm:grid-cols-2">
            <label className="flex items-center gap-3 text-sm font-semibold sm:col-span-2">
              <input
                type="checkbox"
                name="leadCaptureEnabled"
                defaultChecked={content.leadCapture.enabled}
                className="h-5 w-5 accent-[#6f994f]"
              />
              Ask for an email before continuing
            </label>
            <label className="grid gap-2 text-sm font-semibold sm:col-span-2">
              Form heading
              <input name="leadCaptureHeading" defaultValue={content.leadCapture.heading} className="ts-input" />
            </label>
            <label className="flex items-center gap-3 text-sm font-semibold sm:col-span-2">
              <input
                type="checkbox"
                name="leadCaptureFirstName"
                defaultChecked={content.leadCapture.collectFirstName}
                className="h-5 w-5 accent-[#6f994f]"
              />
              Collect first name
            </label>
            <label className="grid gap-2 text-sm font-semibold">
              First-name label
              <input name="leadCaptureFirstNameLabel" defaultValue={content.leadCapture.firstNameLabel} className="ts-input" />
            </label>
            <label className="grid gap-2 text-sm font-semibold">
              Email label
              <input name="leadCaptureEmailLabel" defaultValue={content.leadCapture.emailLabel} className="ts-input" />
            </label>
            <label className="grid gap-2 text-sm font-semibold sm:col-span-2">
              Submit button label
              <input name="leadCaptureSubmitLabel" defaultValue={content.leadCapture.submitLabel} className="ts-input" />
            </label>
          </div>
        </details>

        <details className="rounded-[20px] border border-[#ded3c3] bg-white">
          <summary className="cursor-pointer list-none px-5 py-4 font-semibold marker:hidden">
            Search and social preview
          </summary>
          <div className="grid gap-5 border-t border-[#eadbc5] p-5">
            <label className="grid gap-2 text-sm font-semibold">
              Page title
              <input name="seoTitle" defaultValue={page?.seo.title ?? ""} className="ts-input" />
            </label>
            <label className="grid gap-2 text-sm font-semibold">
              Meta description
              <textarea
                name="seoDescription"
                rows={3}
                defaultValue={page?.seo.description ?? ""}
                className="ts-input resize-y"
              />
            </label>
            <label className="flex items-center gap-3 text-sm font-semibold">
              <input
                type="checkbox"
                name="noIndex"
                defaultChecked={page?.seo.noIndex ?? false}
                className="h-5 w-5 accent-[#6f994f]"
              />
              Keep this page out of search results
            </label>
          </div>
        </details>

        <div className="flex flex-wrap items-center gap-3">
          <FunnelSubmitButton
            label={page ? "Save new draft revision" : "Create managed page draft"}
            pendingLabel="Saving draft…"
          />
          {page ? (
            <a href={previewPath} className="cta-button cta-button--outline">
              Preview latest draft ↗
            </a>
          ) : null}
        </div>
      </form>

      {page ? (
        <div className="mt-6 flex flex-col gap-4 rounded-[20px] border border-[#c7d8b8] bg-[#eef5e7] p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold text-[#456332]">
              {page.status === "published"
                ? `Revision ${publishedRevision} is live at ${page.publicPath}.`
                : "This managed page is not public yet."}
            </p>
            <p className="mt-1 text-sm leading-6 text-ink/58">
              Publishing switches this step to its managed <code>/f/</code> page.
              Existing code-backed pages are left intact.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-3">
            {page.status !== "published" || hasUnpublishedChanges ? (
              <form action={publishFunnelPageAction}>
                <input type="hidden" name="funnelId" value={funnelId} />
                <input type="hidden" name="funnelSlug" value={funnelSlug} />
                <input type="hidden" name="stepId" value={step.id} />
                <input type="hidden" name="pageId" value={page.id} />
                <FunnelSubmitButton
                  label={page.status === "published" ? "Publish latest draft" : "Publish page"}
                  pendingLabel="Publishing…"
                  confirmMessage={`Publish revision ${page.latestRevisionNumber} for “${step.name}”?`}
                />
              </form>
            ) : (
              <a href={page.publicPath} className="cta-button cta-button--outline">
                Open live page ↗
              </a>
            )}
            {page.status === "published" ? (
              <form action={unpublishFunnelPageAction}>
                <input type="hidden" name="funnelId" value={funnelId} />
                <input type="hidden" name="funnelSlug" value={funnelSlug} />
                <input type="hidden" name="stepId" value={step.id} />
                <input type="hidden" name="pageId" value={page.id} />
                <FunnelSubmitButton
                  label="Unpublish"
                  pendingLabel="Unpublishing…"
                  tone="outline"
                  confirmMessage={`Unpublish “${step.name}”? Its revisions will be preserved.`}
                />
              </form>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
