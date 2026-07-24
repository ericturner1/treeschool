import Link from "next/link";
import { getActiveProfileCookie } from "../../lib/accounts/active-profile";
import { getRequestDictionary } from "../../lib/i18n/server";

type ParentModeGuardProps = {
  lang?: string;
  redirectTo: string;
  children: React.ReactNode;
};

export async function ParentModeGuard({
  lang,
  redirectTo,
  children
}: ParentModeGuardProps) {
  const activeProfile = getActiveProfileCookie();

  if (activeProfile?.role !== "STUDENT") {
    return <>{children}</>;
  }

  const { dictionary } = await getRequestDictionary(lang);
  const switcher = dictionary.dashboard.profileSwitcher;

  return (
    <div className="relative">
      <div aria-hidden="true" className="pointer-events-none select-none blur-[2px] saturate-[0.75]">
        {children}
      </div>

      <div className="absolute inset-0 z-40 flex items-start justify-center bg-[rgba(37,32,27,0.38)] px-4 py-10 sm:items-center">
        <div className="w-full max-w-md rounded-[28px] border border-[#dcc8aa] bg-[#fffaf2] px-6 py-6 shadow-[0_24px_48px_rgba(37,32,27,0.22)]">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-earth">
            {switcher.parentSection}
          </p>
          <h2 className="mt-3 text-[30px] font-semibold tracking-[-0.05em] text-ink">
            {switcher.overlayTitle}
          </h2>
          <p className="mt-3 text-base leading-[1.75] text-ink/76">
            {switcher.overlayCopy}
          </p>

          <div className="mt-6 space-y-4">
            <Link
              href={{
                pathname: "/signin",
                query: {
                  next: redirectTo,
                  message: "Verify the parent email to return to parent mode."
                }
              }}
              className="cta-button cta-button--dark w-full"
            >
              Verify parent email
            </Link>
            <p className="text-sm text-ink/65">{switcher.studentLocked}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
