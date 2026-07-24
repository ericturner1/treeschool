import Image from "next/image";
import { redirect } from "next/navigation";
import { getActiveProfileCookie } from "../../../lib/accounts/active-profile";
import { bootstrapParentAccount, listHouseholdProfiles } from "../../../lib/accounts/server";
import { getCurrentUser } from "../../../lib/auth/server";
import { getRequestDictionary } from "../../../lib/i18n/server";
import { listPurchasedNativeWorkbooks } from "../../../lib/native-workbooks/server";
import { ParentModeGuard } from "../parent-mode-guard";
import { ParentShell } from "../parent-shell";

export default async function PurchasedWorkbooksPage({ searchParams }: { searchParams?: { lang?: string } }) {
  const { locale, dictionary } = await getRequestDictionary(searchParams?.lang);
  const { dashboard, home } = dictionary;
  const user = await getCurrentUser();
  if (!user?.id || !user.email) redirect(`/p/signin?lang=${locale}&next=/p/purchased-workbooks`);
  await bootstrapParentAccount({
    userId: user.id,
    email: user.email,
    firstName: user.user_metadata?.first_name ?? user.user_metadata?.name ?? user.user_metadata?.full_name?.split(" ")[0]
  });
  const [profiles, purchased] = await Promise.all([
    listHouseholdProfiles(user.id),
    listPurchasedNativeWorkbooks(user.id)
  ]);
  if (purchased.workbooks.length === 0) redirect("/p/dashboard");
  const parentProfile = profiles.find((profile) => profile.role === "PARENT");
  const studentProfiles = profiles.filter((profile) => profile.role === "STUDENT");
  const activeProfile = profiles.find((profile) => profile.id === getActiveProfileCookie()?.id) ?? parentProfile;

  return (
    <ParentModeGuard lang={searchParams?.lang} redirectTo="/p/purchased-workbooks">
      <ParentShell brandName={home.brand.name} dashboard={dashboard} currentUserEmail={user.email} activeProfile={activeProfile} parentProfile={parentProfile} studentProfiles={studentProfiles} title="Purchased Workbooks" activeNav="workbooks" sidebarLinks={[{ href: "/p/dashboard", label: dashboard.actions.dashboard, tone: "outline" }]}>
        <p className="mb-5 max-w-3xl text-base leading-7 text-ink/65">These permanent purchases remain available here even if your Family Plan ends.</p>
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {purchased.workbooks.map((workbook) => (
            <article key={workbook.purchaseId} className="overflow-hidden rounded-[24px] border border-[#dcc8aa] bg-[#fffaf2]">
              <div className="relative aspect-[4/3] border-b border-[#e4d4bb] bg-white">{workbook.thumbnailUrl ? <Image src={workbook.thumbnailUrl} alt={`${workbook.title} cover`} fill unoptimized className="object-contain p-4" /> : null}</div>
              <div className="p-5"><p className="text-xs font-black uppercase tracking-[0.12em] text-earth">{workbook.subjectLabel}</p><h2 className="mt-2 text-2xl font-semibold leading-tight">{workbook.title}</h2><p className="mt-2 text-sm text-ink/55">{workbook.pageCount} pages · Purchased {new Date(workbook.purchasedAt).toLocaleDateString()}</p><a href={`/api/workbooks/download?purchaseId=${encodeURIComponent(workbook.purchaseId)}`} className="cta-button cta-button--light cta-button--small mt-5 w-full">Download PDF</a></div>
            </article>
          ))}
        </div>
      </ParentShell>
    </ParentModeGuard>
  );
}
