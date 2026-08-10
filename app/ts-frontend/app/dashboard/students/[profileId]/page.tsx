import { redirect } from "next/navigation";

type StudentManagementPageProps = {
  params: Promise<{
    profileId?: string;
  }>;
  searchParams?: Promise<{
    lang?: string;
    error?: string;
    message?: string;
  }>;
};

export default async function StudentManagementPage(props: StudentManagementPageProps) {
  const searchParams = await props.searchParams;
  const params = await props.params;
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
