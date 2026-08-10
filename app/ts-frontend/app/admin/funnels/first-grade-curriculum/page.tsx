import { AdminFunnelDetailPage } from "../funnel-detail-page";

export default async function FirstGradeCurriculumFunnelPage(
  props: {
    searchParams?: Promise<{ step?: string; page?: string; tab?: string; message?: string; error?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  return await AdminFunnelDetailPage({
    funnelId: "first-grade-curriculum",
    selectedStepId: searchParams?.step,
    selectedPageId: searchParams?.page,
    selectedTab: searchParams?.tab,
    message: searchParams?.message,
    error: searchParams?.error
  });
}
