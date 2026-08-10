import { AdminFunnelDetailPage } from "../funnel-detail-page";

export default async function AdminDynamicFunnelPage(
  props: {
    params: Promise<{ funnelId: string }>;
    searchParams?: Promise<{ step?: string; page?: string; tab?: string; message?: string; error?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  return await AdminFunnelDetailPage({
    funnelId: params.funnelId,
    selectedStepId: searchParams?.step,
    selectedPageId: searchParams?.page,
    selectedTab: searchParams?.tab,
    message: searchParams?.message,
    error: searchParams?.error
  });
}
