import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ManagedFunnelPageView } from "../../../../../../components/managed-funnel-page";
import { getCurrentUser } from "../../../../../../lib/auth/server";
import {
  getAdminFunnelPage,
  type ManagedFunnelPagePayload
} from "../../../../../../lib/funnels/server";
import { getNativeWorkbookNavigation } from "../../../../../../lib/native-workbooks/server";

export const metadata: Metadata = {
  title: "Funnel page preview · Treeschool Admin",
  robots: { index: false, follow: false }
};

export default async function AdminManagedFunnelPagePreview({
  params,
  searchParams
}: {
  params: { funnelId: string; stepId: string };
  searchParams?: { page?: string };
}) {
  const backHref =
    `/admin/funnels/${encodeURIComponent(params.funnelId)}?step=${encodeURIComponent(params.stepId)}` +
    (searchParams?.page ? `&page=${encodeURIComponent(searchParams.page)}` : "");
  const user = await getCurrentUser();
  if (!user?.id) redirect(`/p/signin?next=${encodeURIComponent(backHref)}`);
  const access = await getNativeWorkbookNavigation(user.id).catch(() => null);
  if (!access?.isAdmin) notFound();

  const data = await getAdminFunnelPage(
    user.id,
    params.funnelId,
    params.stepId,
    searchParams?.page
  ).catch(() => null);
  if (!data || !data.page) notFound();
  const previewData: ManagedFunnelPagePayload = {
    funnel: data.funnel,
    step: data.step,
    page: data.page
  };

  return <ManagedFunnelPageView data={previewData} adminBackHref={backHref} />;
}
