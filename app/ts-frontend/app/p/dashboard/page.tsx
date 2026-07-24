import DashboardPage from "../../dashboard/page";
import { ParentModeGuard } from "../parent-mode-guard";

type ParentDashboardPageProps = {
  searchParams?: {
    lang?: string;
    error?: string;
    message?: string;
    student_checkout?: string;
  };
};

export default function ParentDashboardPage({ searchParams }: ParentDashboardPageProps) {
  const query = new URLSearchParams();
  const resolvedSearchParams = {
    ...searchParams,
    message: searchParams?.message ?? (searchParams?.student_checkout === "success"
      ? "Payment received. The additional student will appear as soon as Stripe confirms it."
      : undefined),
    error: searchParams?.error ?? (searchParams?.student_checkout === "canceled"
      ? "Additional-student checkout was canceled. No profile was created and no recurring seat was added."
      : undefined)
  };

  if (searchParams?.lang) {
    query.set("lang", searchParams.lang);
  }

  if (resolvedSearchParams.message) {
    query.set("message", resolvedSearchParams.message);
  }

  if (resolvedSearchParams.error) {
    query.set("error", resolvedSearchParams.error);
  }

  const redirectTo = query.size > 0 ? `/p/dashboard?${query.toString()}` : "/p/dashboard";

  return (
    <ParentModeGuard lang={searchParams?.lang} redirectTo={redirectTo}>
      <DashboardPage searchParams={resolvedSearchParams} />
    </ParentModeGuard>
  );
}
