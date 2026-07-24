import { redirect } from "next/navigation";

type StudentManagementPageProps = {
  params: {
    profileId?: string;
  };
  searchParams?: {
    lang?: string;
    error?: string;
    message?: string;
  };
};

export default function StudentManagementPage({ params, searchParams }: StudentManagementPageProps) {
  const profileId = params.profileId;

  if (!profileId) {
    redirect("/p/dashboard?error=Student profile is required.");
  }

  const query = new URLSearchParams();
  if (searchParams?.lang) query.set("lang", searchParams.lang);
  if (searchParams?.message) query.set("message", searchParams.message);
  if (searchParams?.error) query.set("error", searchParams.error);

  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  redirect(`/p/student/${profileId}${suffix}`);
}
