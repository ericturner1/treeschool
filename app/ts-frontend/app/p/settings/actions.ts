"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { updateParentAccountPreferences } from "../../../lib/accounts/server";
import { getCurrentUser } from "../../../lib/auth/server";
import { isPrintPageSize } from "../../../lib/print-page-sizes";

export async function updatePreferencesAction(formData: FormData) {
  const currentUser = await getCurrentUser();
  if (!currentUser?.id) redirect("/p/signin");

  const preferredPrintPageSize = String(formData.get("preferredPrintPageSize") ?? "");
  if (!isPrintPageSize(preferredPrintPageSize)) {
    redirect("/p/settings?error=Choose+a+supported+print+page+size.");
  }

  try {
    await updateParentAccountPreferences({
      userId: currentUser.id,
      preferredPrintPageSize
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save your preferences.";
    redirect(`/p/settings?error=${encodeURIComponent(message)}`);
  }

  revalidatePath("/p/settings");
  redirect("/p/settings?message=Preferences+saved.");
}
