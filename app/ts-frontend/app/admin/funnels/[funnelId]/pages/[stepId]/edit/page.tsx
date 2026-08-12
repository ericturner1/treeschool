import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { FunnelPageStudio } from "../../../../funnel-page-studio";
import { getCurrentUser } from "../../../../../../../lib/auth/server";
import { getLegacyFunnelPageImport } from "../../../../../../../lib/funnels/legacy-page-imports";
import {
  getAdminFunnel,
  getAdminFunnelPage,
  saveAdminFunnelPageDraft
} from "../../../../../../../lib/funnels/server";
import { upgradeCatalogWorkbookImages } from "../../../../../../../lib/funnels/workbook-gallery-upgrade";
import { getNativeWorkbookNavigation, listNativeWorkbookCatalog } from "../../../../../../../lib/native-workbooks/server";

export const metadata: Metadata = {
  title: "Funnel page editor · Treeschool Admin",
  robots: { index: false, follow: false }
};

export default async function FunnelPageEditorRoute(
  props: {
    params: Promise<{ funnelId: string; stepId: string }>;
    searchParams?: Promise<{ page?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const next = `/admin/funnels/${encodeURIComponent(params.funnelId)}/pages/${encodeURIComponent(params.stepId)}/edit${searchParams?.page ? `?page=${encodeURIComponent(searchParams.page)}` : ""}`;
  const user = await getCurrentUser();
  if (!user?.id) redirect(`/p/signin?next=${encodeURIComponent(next)}`);
  const access = await getNativeWorkbookNavigation(user.id).catch(() => null);
  if (!access?.isAdmin) notFound();

  // Admin routes use the readable funnel slug, while the page API keeps UUID
  // foreign keys at its boundary. Resolve the route identifier before asking
  // for the selected page so valid editor links do not become false 404s.
  const funnelData = await getAdminFunnel(user.id, params.funnelId).catch(() => null);
  if (!funnelData?.funnel.id) notFound();
  const resolvedFunnelId = funnelData.funnel.id;

  let data = await getAdminFunnelPage(
    user.id,
    resolvedFunnelId,
    params.stepId,
    searchParams?.page
  ).catch(() => null);
  if (!data) notFound();
  let resolvedData = data;
  const catalog = (await listNativeWorkbookCatalog({
    userId: user.id
  }).catch(() => ({ workbooks: [] }))).workbooks;

  // Code-backed funnel pages predate the managed page editor. The first time
  // an admin opens one, preserve its authored copy and media as an imported
  // CMS draft. This deliberately leaves the live legacy URL untouched; only
  // an explicit Publish action moves traffic to the managed page.
  if (!resolvedData.page && !searchParams?.page) {
    const legacyImport = getLegacyFunnelPageImport(resolvedData.step);
    if (legacyImport) {
      const upgradedImport = upgradeCatalogWorkbookImages(
        legacyImport.content,
        catalog
      );
      const imported = await saveAdminFunnelPageDraft({
        userId: user.id,
        funnelId: resolvedData.funnel.id,
        stepId: resolvedData.step.id,
        pageId: null,
        source: "imported",
        content: upgradedImport.content,
        seo: legacyImport.seo
      }).catch(() => null);
      if (imported?.page.id) {
        resolvedData = await getAdminFunnelPage(
          user.id,
          resolvedFunnelId,
          params.stepId,
          imported.page.id
        ).catch(() => resolvedData);
      }
    }
  }

  // Earlier legacy imports represented catalog workbook covers as plain image
  // elements even though their live code-backed page used the interactive
  // workbook gallery. Add one immutable migration revision when such a draft
  // is opened so the editor and managed renderer share the same element type.
  if (resolvedData.page) {
    const upgraded = upgradeCatalogWorkbookImages(
      resolvedData.page.content,
      catalog
    );
    if (upgraded.upgradedCount > 0) {
      const migrated = await saveAdminFunnelPageDraft({
        userId: user.id,
        funnelId: resolvedData.funnel.id,
        stepId: resolvedData.step.id,
        pageId: resolvedData.page.id,
        source: "imported",
        content: upgraded.content,
        seo: resolvedData.page.seo
      }).catch(() => null);
      if (migrated?.page.id) {
        resolvedData = await getAdminFunnelPage(
          user.id,
          resolvedFunnelId,
          params.stepId,
          migrated.page.id
        ).catch(() => resolvedData);
      }
    }
  }

  const orderFormCatalog = catalog;

  return <FunnelPageStudio funnelId={resolvedData.funnel.id} funnelSlug={resolvedData.funnel.slug} stepId={resolvedData.step.id} data={resolvedData} orderFormCatalog={orderFormCatalog} editorUserEmail={user.email ?? null} />;
}
