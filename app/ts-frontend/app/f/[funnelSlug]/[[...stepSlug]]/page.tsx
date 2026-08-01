import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { ManagedFunnelPageView } from "../../../../components/managed-funnel-page";
import { getPublicFunnelPage } from "../../../../lib/funnels/server";

type PublicFunnelPageProps = {
  params: {
    funnelSlug: string;
    stepSlug?: string[];
  };
};

async function loadPage(
  params: PublicFunnelPageProps["params"],
  visitorId?: string | null
) {
  if ((params.stepSlug?.length ?? 0) > 1) return null;
  return getPublicFunnelPage(
    params.funnelSlug,
    params.stepSlug?.[0],
    visitorId
  ).catch(() => null);
}

export async function generateMetadata({
  params
}: PublicFunnelPageProps): Promise<Metadata> {
  const data = await loadPage(params);
  if (!data) return {};

  const title = data.page.seo.title || data.page.content.headline;
  const description =
    data.page.seo.description ||
    data.page.content.subheadline ||
    data.funnel.name;
  const canonical = `https://www.treehomeschool.com${data.page.publicPath}`;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      type: "website",
      url: canonical
    },
    robots: data.page.seo.noIndex
      ? { index: false, follow: false }
      : { index: true, follow: true }
  };
}

export default async function PublicManagedFunnelPage({
  params
}: PublicFunnelPageProps) {
  const visitorId = headers().get("x-treeschool-funnel-visitor-id");
  const data = await loadPage(params, visitorId);
  if (!data) notFound();
  return <ManagedFunnelPageView data={data} visitorId={visitorId} />;
}
