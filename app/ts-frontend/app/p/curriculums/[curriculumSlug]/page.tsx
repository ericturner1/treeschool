import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { bootstrapParentAccount } from "../../../../lib/accounts/server";
import { getCurrentUser } from "../../../../lib/auth/server";
import { getParentCurriculumTree } from "../../../../lib/curriculum/server";
import { getRequestDictionary } from "../../../../lib/i18n/server";
import { ParentModeGuard } from "../../parent-mode-guard";
import { StandardLessonPanel } from "./standard-lesson-panel";

type ParentCurriculumDetailPageProps = {
  params: Promise<{
    curriculumSlug?: string;
  }>;
  searchParams?: Promise<{
    lang?: string;
  }>;
};

type TreeNode = Awaited<ReturnType<typeof getParentCurriculumTree>>[number];

function buildNodeMap(nodes: TreeNode[]) {
  const byParent = new Map<string | null, TreeNode[]>();

  for (const node of nodes) {
    const bucket = byParent.get(node.parentId) ?? [];
    bucket.push(node);
    byParent.set(node.parentId, bucket);
  }

  return byParent;
}

export default async function ParentCurriculumDetailPage(props: ParentCurriculumDetailPageProps) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const { locale, dictionary } = await getRequestDictionary(searchParams?.lang);
  const { home, dashboard } = dictionary;
  const currentUser = await getCurrentUser();

  if (!currentUser?.id || !currentUser.email) {
    redirect(`/p/signin?lang=${locale}`);
  }

  const curriculumSlug = params.curriculumSlug;
  if (!curriculumSlug) {
    notFound();
  }

  const parentFirstName =
    currentUser.user_metadata?.first_name ??
    currentUser.user_metadata?.name ??
    currentUser.user_metadata?.full_name?.split(" ")[0];

  await bootstrapParentAccount({
    userId: currentUser.id,
    email: currentUser.email,
    firstName: parentFirstName
  });

  let nodes: TreeNode[];
  try {
    nodes = await getParentCurriculumTree(curriculumSlug, locale, currentUser.id);
  } catch {
    notFound();
  }

  const subject = nodes[0];
  if (!subject) {
    notFound();
  }

  const byParent = buildNodeMap(nodes);
  const domains = byParent.get(subject.id) ?? [];
  const topClusters = domains.filter((node) => node.type === "cluster");
  const actualDomains = domains.filter((node) => node.type === "domain");
  const redirectTo = searchParams?.lang
    ? `/p/curriculums/${curriculumSlug}?lang=${searchParams.lang}`
    : `/p/curriculums/${curriculumSlug}`;

  const renderStandard = (standard: TreeNode) => (
    <StandardLessonPanel
      key={standard.id}
      standard={standard}
      returnTo={redirectTo}
      labels={dashboard.curriculumDetail}
    />
  );

  return (
    <ParentModeGuard lang={searchParams?.lang} redirectTo={redirectTo}>
      <main className="min-h-screen bg-[#f8f1e4] px-4 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
        <div className="border-b border-[#e2d0b1] pb-6">
          <Link href="/" className="inline-flex items-center gap-0 text-[28px] font-semibold tracking-[-0.05em] text-ink">
            <img src="/tree-icon.png" alt="treeschool tree icon" className="h-28 w-28 object-contain" />
            <span className="brand-logo">{home.brand.name}</span>
          </Link>
          <div className="mt-6">
            <Link
              href="/p/curriculums"
              className="text-sm font-semibold text-earth underline underline-offset-4"
            >
              Back to curriculums
            </Link>
            <h1 className="mt-4 text-4xl font-semibold tracking-[-0.05em] text-ink sm:text-5xl">
              {subject.title}
            </h1>
            <p className="mt-3 max-w-3xl text-lg leading-[1.75] text-ink/76 sm:text-[21px]">
              {subject.description ?? "Review the curriculum structure from domain to cluster to standard."}
            </p>
          </div>
        </div>

        {actualDomains.length > 0 ? (
          <section className="mt-10 space-y-8">
            {actualDomains.map((domain) => {
              const clusters = (byParent.get(domain.id) ?? []).filter((node) => node.type === "cluster");
              const standards = (byParent.get(domain.id) ?? []).filter((node) =>
                ["skill", "standard"].includes(node.type)
              );

              return (
                <div key={domain.id} className="site-panel rounded-[28px] px-6 py-7">
                  <div className="flex items-center gap-3">
                    <span className="rounded-[999px] bg-[#f1e6d2] px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-earth">
                      Domain
                    </span>
                    <h2 className="text-[30px] font-semibold tracking-[-0.05em] text-ink">{domain.title}</h2>
                  </div>
                  {domain.description ? (
                    <p className="mt-3 text-base leading-[1.8] text-ink/72">{domain.description}</p>
                  ) : null}

                  {clusters.length > 0 ? (
                    <div className="mt-6 grid gap-5 lg:grid-cols-2">
                      {clusters.map((cluster) => {
                        const clusterStandards = (byParent.get(cluster.id) ?? []).filter((node) =>
                          ["skill", "standard"].includes(node.type)
                        );

                        return (
                          <div key={cluster.id} className="rounded-[24px] border border-[#dcc8aa] bg-[#fffaf2] px-5 py-5">
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#6d8f52]">Cluster</p>
                            <h3 className="mt-2 text-[24px] font-semibold tracking-[-0.04em] text-ink">
                              {cluster.title}
                            </h3>
                            {cluster.description ? (
                              <p className="mt-2 text-sm leading-[1.7] text-ink/72">{cluster.description}</p>
                            ) : null}

                            <div className="mt-4 space-y-3">
                              {clusterStandards.map(renderStandard)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="mt-6 space-y-3">
                      {standards.map(renderStandard)}
                    </div>
                  )}
                </div>
              );
            })}
          </section>
        ) : (
          <section className="mt-10 grid gap-5 lg:grid-cols-2">
            {topClusters.map((cluster) => {
              const standards = (byParent.get(cluster.id) ?? []).filter((node) =>
                ["skill", "standard"].includes(node.type)
              );

              return (
                <div key={cluster.id} className="site-panel rounded-[28px] px-6 py-7">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#6d8f52]">Cluster</p>
                  <h2 className="mt-2 text-[28px] font-semibold tracking-[-0.05em] text-ink">{cluster.title}</h2>
                  {cluster.description ? (
                    <p className="mt-2 text-sm leading-[1.7] text-ink/72">{cluster.description}</p>
                  ) : null}

                  <div className="mt-5 space-y-3">
                    {standards.map(renderStandard)}
                  </div>
                </div>
              );
            })}
          </section>
        )}
        </div>
      </main>
    </ParentModeGuard>
  );
}
