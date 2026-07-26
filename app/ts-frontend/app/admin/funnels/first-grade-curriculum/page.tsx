import { AdminFunnelDetailPage } from "../funnel-detail-page";

export default async function FirstGradeCurriculumFunnelPage() {
  return await AdminFunnelDetailPage({ funnelId: "first-grade-curriculum" });
}
