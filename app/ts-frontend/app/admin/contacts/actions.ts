"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "../../../lib/auth/server";
import { saveAdminFunnelContact } from "../../../lib/funnels/server";

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function saveContactAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user?.id) redirect("/p/signin?next=/admin/contacts");
  const contactId = value(formData, "contactId");
  try {
    await saveAdminFunnelContact({
      userId: user.id,
      contactId,
      firstName: value(formData, "firstName") || null,
      status: value(formData, "status"),
      tags: value(formData, "tags").split(",").map((tag) => tag.trim()).filter(Boolean)
    });
    revalidatePath("/admin/contacts");
    revalidatePath(`/admin/contacts/${contactId}`);
    redirect(`/admin/contacts/${contactId}?message=${encodeURIComponent("Contact updated.")}`);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    const message = error instanceof Error ? error.message : "Could not save the contact.";
    redirect(`/admin/contacts/${contactId}?error=${encodeURIComponent(message)}`);
  }
}
