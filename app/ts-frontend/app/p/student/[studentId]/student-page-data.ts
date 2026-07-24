import { redirect } from "next/navigation";
import { getActiveProfileCookie } from "../../../../lib/accounts/active-profile";
import { bootstrapParentAccount, listHouseholdProfiles } from "../../../../lib/accounts/server";
import { getCurrentUser } from "../../../../lib/auth/server";
import { getRequestDictionary } from "../../../../lib/i18n/server";

type StudentSearchParams = Record<string, string | string[] | undefined>;

export function studentRoutePath(
  routeSegment: string,
  suffix = "",
  searchParams?: StudentSearchParams
) {
  const query = new URLSearchParams();
  for (const [key, rawValue] of Object.entries(searchParams ?? {})) {
    const values = Array.isArray(rawValue) ? rawValue : [rawValue];
    for (const value of values) {
      if (value != null && value !== "") query.append(key, value);
    }
  }
  const path = `/p/student/${routeSegment}${suffix}`;
  return query.size > 0 ? `${path}?${query.toString()}` : path;
}

export async function getParentStudentPageData(studentId: string | undefined, lang?: string) {
  const { locale, dictionary } = await getRequestDictionary(lang);
  const { dashboard, home } = dictionary;
  const currentUser = await getCurrentUser();

  if (!currentUser?.id || !currentUser.email) {
    redirect(`/p/signin?lang=${locale}&message=${encodeURIComponent(dashboard.unauthenticated)}`);
  }

  if (!studentId) {
    redirect(`/p/dashboard?lang=${locale}&error=Student profile is required.`);
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

  const profiles = await listHouseholdProfiles(currentUser.id);
  const parentProfile = profiles.find((profile) => profile.role === "PARENT");
  const studentProfiles = profiles.filter((profile) => profile.role === "STUDENT");
  const activeCookie = getActiveProfileCookie();
  const activeProfile = profiles.find((profile) => profile.id === activeCookie?.id) ?? parentProfile;
  const student = studentProfiles.find((profile) =>
    profile.id === studentId || profile.slug === studentId
  );

  if (!student) {
    redirect(`/p/dashboard?lang=${locale}&error=Student profile was not found.`);
  }

  const studentRouteSegment = student.slug ?? student.id;

  return {
    locale,
    dictionary,
    dashboard,
    home,
    currentUser: currentUser as {
      id: string;
      email: string;
      user_metadata?: Record<string, unknown>;
    },
    parentProfile,
    studentProfiles,
    activeProfile,
    student,
    studentRouteSegment
  };
}
