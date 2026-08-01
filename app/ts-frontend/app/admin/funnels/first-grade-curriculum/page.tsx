import { AdminFunnelDetailPage } from "../funnel-detail-page";

export default async function FirstGradeCurriculumFunnelPage({
  searchParams
}: {
  searchParams?: { step?: string; page?: string; tab?: string; message?: string; error?: string };
}) {
  return await AdminFunnelDetailPage({
    funnelId: "first-grade-curriculum",
    selectedStepId: searchParams?.step,
    selectedPageId: searchParams?.page,
    selectedTab: searchParams?.tab,
    message: searchParams?.message,
    error: searchParams?.error
  });
}
