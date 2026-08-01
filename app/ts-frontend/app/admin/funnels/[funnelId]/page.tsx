import { AdminFunnelDetailPage } from "../funnel-detail-page";

export default async function AdminDynamicFunnelPage({
  params,
  searchParams
}: {
  params: { funnelId: string };
  searchParams?: { step?: string; page?: string; tab?: string; message?: string; error?: string };
}) {
  return await AdminFunnelDetailPage({
    funnelId: params.funnelId,
    selectedStepId: searchParams?.step,
    selectedPageId: searchParams?.page,
    selectedTab: searchParams?.tab,
    message: searchParams?.message,
    error: searchParams?.error
  });
}
