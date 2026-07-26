import type { Route } from "next";
import Link from "next/link";
import { logoutAction } from "../auth/actions";
import { createStudentProfileAction } from "../dashboard/actions";
import { AddStudentModal } from "../dashboard/add-student-modal";
import { getCurrentUser } from "../../lib/auth/server";
import { getNativeWorkbookNavigation } from "../../lib/native-workbooks/server";

type ParentShellProfile = {
  id: string;
  firstName: string | null;
  role: "PARENT" | "STUDENT";
  accountRole?: "OWNER" | "ADMIN" | "TEACHER" | null;
};

export type ParentSidebarLink = {
  href: Route;
  label: string;
  tone: "light" | "outline" | "dark";
};

type ParentShellProps = {
  brandName: string;
  dashboard: {
    welcome: string;
    parentRole: string;
    studentRole: string;
    actions: {
      dashboard: string;
      browse: string;
      electives: string;
      settings: string;
      teachers: string;
      account: string;
      logout: string;
    };
    billing: {
      title: string;
    };
    profileManagement: {
      empty: string;
      addTitle: string;
      addButton: string;
      cancel: string;
      submit: string;
      fields: {
        firstName: string;
        birthDate: string;
        gradeLevel: string;
      };
    };
  };
  currentUserEmail: string;
  activeProfile: ParentShellProfile | undefined;
  parentProfile: ParentShellProfile | undefined;
  studentProfiles: ParentShellProfile[];
  title: string;
  activeNav?: "curriculums" | "electives" | "workbooks" | "settings" | "account" | "billing" | null;
  sidebarLinks?: ParentSidebarLink[];
  children: React.ReactNode;
};

export async function ParentShell({
  brandName,
  dashboard,
  currentUserEmail,
  activeProfile,
  parentProfile,
  studentProfiles,
  title,
  activeNav = null,
  sidebarLinks,
  children
}: ParentShellProps) {
  const isParentView = activeProfile?.role !== "STUDENT";
  const canManageAccount = parentProfile?.accountRole !== "TEACHER";
  const currentUser = isParentView ? await getCurrentUser() : null;
  const workbookNavigation = currentUser?.id
    ? await getNativeWorkbookNavigation(currentUser.id).catch(() => ({ isAdmin: false, purchasedWorkbookCount: 0 }))
    : { isAdmin: false, purchasedWorkbookCount: 0 };
  const resolvedSidebarLinks =
    sidebarLinks ??
    [
      ...(activeNav !== null
        ? [
            {
              href: "/p/dashboard" as Route,
              label: dashboard.actions.dashboard,
              tone: "outline" as const
            }
          ]
        : [])
    ] satisfies ParentSidebarLink[];

  return (
    <main className="min-h-screen bg-[#f8f1e4] px-3 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-10">
      <div className="mx-auto grid max-w-[1400px] gap-4 lg:grid-cols-[280px_minmax(0,1fr)] lg:items-start lg:gap-6">
        <aside className="min-w-0 rounded-[22px] border border-[#dec9a9] bg-[#fffaf2] px-3 py-3 sm:px-4 lg:sticky lg:top-4 lg:flex lg:min-h-[calc(100vh-5rem)] lg:flex-col lg:py-4">
          <Link
            href="/"
            className="flex min-w-0 items-center text-left text-[20px] font-semibold tracking-[-0.05em] text-ink lg:w-full lg:flex-col lg:justify-center lg:text-center lg:text-[28px]"
          >
            <img src="/tree-icon.png" alt="treeschool tree icon" className="h-11 w-11 flex-none object-contain lg:h-24 lg:w-24" />
            <span className="brand-logo">{brandName}</span>
          </Link>

          <div className="mt-2 flex min-w-0 items-center justify-between gap-3 rounded-[14px] bg-[#f8f1e4] px-3 py-2 lg:mt-6 lg:block lg:bg-transparent lg:px-0 lg:py-0">
            <p className="min-w-0 truncate text-sm font-semibold text-earth lg:text-center">
              {dashboard.welcome}: {activeProfile?.firstName ?? currentUserEmail}
            </p>
            <p className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink/58 lg:mt-1 lg:text-center lg:text-xs lg:tracking-[0.14em]">
              {activeProfile?.role === "STUDENT" ? dashboard.studentRole : dashboard.parentRole}
            </p>
          </div>

          <div className="mt-3 flex min-w-0 flex-wrap gap-2 lg:mt-6 lg:block lg:space-y-3">
            {resolvedSidebarLinks.map((link) => (
              <Link
                key={`${link.href}:${link.label}`}
                href={link.href}
                className={`cta-button cta-button--small min-w-0 flex-1 lg:w-full ${
                  link.tone === "light"
                    ? "cta-button--light"
                    : link.tone === "dark"
                      ? "cta-button--dark"
                      : "cta-button--outline"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>

          {sidebarLinks || !canManageAccount ? null : isParentView ? (
            <div className="mt-2 sm:max-w-xs lg:mt-3 lg:max-w-none">
              <AddStudentModal
                action={createStudentProfileAction}
                title={dashboard.profileManagement.addTitle}
                openLabel={dashboard.profileManagement.addButton}
                cancelLabel={dashboard.profileManagement.cancel}
                submitLabel={dashboard.profileManagement.submit}
                fields={dashboard.profileManagement.fields}
              />
            </div>
          ) : null}

          <nav
            aria-label="Parent navigation"
            className="mt-3 grid grid-cols-2 gap-2 border-t border-[#eadbc2] pt-3 lg:mt-auto lg:block lg:space-y-3 lg:border-0 lg:pt-6"
          >
              {isParentView ? (
                <>
                  {workbookNavigation.purchasedWorkbookCount > 0 ? (
                    <Link
                      href="/p/purchased-workbooks"
                      className={`cta-button cta-button--small min-w-0 !w-full ${activeNav === "workbooks" ? "cta-button--light" : "cta-button--outline"}`}
                    >
                      Purchased Workbooks
                    </Link>
                  ) : null}
                  {canManageAccount ? <Link
                      href="/p/settings"
                      className={`cta-button cta-button--small min-w-0 !w-full ${activeNav === "settings" ? "cta-button--light" : "cta-button--outline"}`}
                    >
                      {dashboard.actions.settings}
                    </Link> : null}
                  <Link
                    href={"/p/account#teachers" as Route}
                    className="cta-button cta-button--small cta-button--outline min-w-0 !w-full"
                  >
                    {dashboard.actions.teachers}
                  </Link>
                  <Link
                    href="/p/account"
                    className={`cta-button cta-button--small min-w-0 !w-full ${activeNav === "account" ? "cta-button--light" : "cta-button--outline"}`}
                  >
                    {dashboard.actions.account}
                  </Link>
                  {canManageAccount ? <Link
                      href="/p/billing"
                      className={`cta-button cta-button--small min-w-0 !w-full ${activeNav === "billing" ? "cta-button--light" : "cta-button--outline"}`}
                    >
                      {dashboard.billing.title}
                    </Link> : null}
                  {workbookNavigation.isAdmin ? (
                    <Link
                      href="/admin"
                      className="flex min-h-12 min-w-0 w-full items-center justify-center gap-2.5 rounded-[16px] border border-[#554463] bg-[#675375] px-4 py-3 text-sm font-semibold text-white shadow-[0_5px_0_#45374f] transition hover:-translate-y-0.5 hover:bg-[#735f81] hover:shadow-[0_6px_0_#45374f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9c83ad] focus-visible:ring-offset-2"
                    >
                      <svg
                        aria-hidden="true"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.9"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="h-[18px] w-[18px]"
                      >
                        <path d="M12 3 19 6v5c0 4.7-2.8 8-7 10-4.2-2-7-5.3-7-10V6l7-3Z" />
                        <path d="M9.5 12.2 11.2 14l3.7-4" />
                      </svg>
                      Admin
                    </Link>
                  ) : null}
                </>
              ) : null}
              <form action={logoutAction} className="min-w-0 w-full">
                <button type="submit" className="cta-button cta-button--dark cta-button--small !w-full">
                  {dashboard.actions.logout}
                </button>
              </form>
          </nav>
        </aside>

        <div className="min-w-0">
          <div className="pb-2 lg:pb-3">
            <p className="break-words text-[32px] font-semibold leading-tight tracking-[-0.05em] text-ink sm:text-5xl">{title}</p>
          </div>
          {children}
        </div>
      </div>
    </main>
  );
}
