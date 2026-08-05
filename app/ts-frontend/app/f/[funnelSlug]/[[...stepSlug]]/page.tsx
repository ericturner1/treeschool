import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { ManagedFunnelPageView } from "../../../../components/managed-funnel-page";
import { getPublicFunnelPage } from "../../../../lib/funnels/server";
import {
  getFunnelDocumentDescription,
  getFunnelDocumentTitle
} from "../../../../lib/funnels/page-document";

type PublicFunnelPageProps = {
  params: {
    funnelSlug: string;
    stepSlug?: string[];
  };
  searchParams?: { source_session_id?: string | string[] };
};

function sourceSessionId(searchParams: PublicFunnelPageProps["searchParams"]) {
  const value = searchParams?.source_session_id;
  return (Array.isArray(value) ? value[0] : value)?.trim() || null;
}

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

  const title = data.page.seo.title || getFunnelDocumentTitle(data.page.content);
  const description =
    data.page.seo.description ||
    getFunnelDocumentDescription(data.page.content) ||
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
  params,
  searchParams
}: PublicFunnelPageProps) {
  const visitorId = headers().get("x-treeschool-funnel-visitor-id");
  const data = await loadPage(params, visitorId);
  if (!data) notFound();
  return <ManagedFunnelPageView data={data} visitorId={visitorId} sourceCheckoutSessionId={sourceSessionId(searchParams)} />;
}
