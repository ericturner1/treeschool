import { AdminFunnelDetailPage } from "../funnel-detail-page";

export default async function AdminDynamicFunnelPage({
  params
}: {
  params: { funnelId: string };
}) {
  return await AdminFunnelDetailPage({ funnelId: params.funnelId });
}
