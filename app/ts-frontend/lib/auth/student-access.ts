import { getActiveProfileCookie } from "../accounts/active-profile";
import { listHouseholdProfiles } from "../accounts/server";
import { getCurrentUser } from "./server";

export async function getCurrentStudentAccess(requestedProfileId?: string) {
  const user = await getCurrentUser();
  const activeProfile = getActiveProfileCookie();
  if (!user?.id || !activeProfile || activeProfile.role !== "STUDENT") return null;
  if (requestedProfileId && requestedProfileId !== activeProfile.id) return null;

  const householdProfiles = await listHouseholdProfiles(user.id);
  const student = householdProfiles.find(
    (profile) => profile.id === activeProfile.id && profile.role === "STUDENT"
  );
  if (!student) return null;

  return { user, student };
}
