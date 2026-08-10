import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { ManagedFunnelPageView } from "../../components/managed-funnel-page";
import { getPublicFunnelPageByPath } from "../../lib/funnels/server";
import {
  getFunnelDocumentDescription,
  getFunnelDocumentTitle
} from "../../lib/funnels/page-document";

type FunnelPathParams = { funnelPath: string[] };
type FunnelSearchParams = { source_session_id?: string | string[] };
type FlexibleFunnelPageProps = {
  params: Promise<FunnelPathParams>;
  searchParams?: Promise<FunnelSearchParams>;
};

function sourceSessionId(searchParams?: FunnelSearchParams) {
  const value = searchParams?.source_session_id;
  return (Array.isArray(value) ? value[0] : value)?.trim() || null;
}

function requestedPath(params: FunnelPathParams) {
  return `/${params.funnelPath.map((segment) => encodeURIComponent(segment)).join("/")}`;
}

async function loadPage(params: FunnelPathParams, visitorId?: string | null) {
  return getPublicFunnelPageByPath(requestedPath(params), visitorId).catch(() => null);
}

export async function generateMetadata(props: FlexibleFunnelPageProps): Promise<Metadata> {
  const params = await props.params;
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
    openGraph: { title, description, type: "website", url: canonical },
    robots: data.page.seo.noIndex
      ? { index: false, follow: false }
      : { index: true, follow: true }
  };
}

export default async function FlexiblePublicFunnelPage(props: FlexibleFunnelPageProps) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const visitorId = (await headers()).get("x-treeschool-funnel-visitor-id");
  const data = await loadPage(params, visitorId);
  if (!data) notFound();
  return <ManagedFunnelPageView data={data} visitorId={visitorId} sourceCheckoutSessionId={sourceSessionId(searchParams)} />;
}
