"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "../../../lib/auth/server";
import {
  deleteSalesFaq,
  reorderSalesFaqs,
  saveSalesFaq
} from "../../../lib/faqs/server";

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function redirectWithError(error: unknown): never {
  const message = error instanceof Error ? error.message : "Something went wrong.";
  redirect(`/admin/faqs?error=${encodeURIComponent(message)}`);
}

async function requireUser() {
  const user = await getCurrentUser();
  if (!user?.id) redirect("/p/signin?next=/admin/faqs");
  return { ...user, id: user.id };
}

function refreshFaqPages() {
  revalidateTag("faqs:published");
  revalidatePath("/faq");
  revalidatePath("/sitemap.xml");
  revalidatePath("/admin/faqs");
}

export async function saveFaqAction(formData: FormData) {
  const user = await requireUser();
  const id = value(formData, "id") || undefined;
  try {
    await saveSalesFaq({
      id,
      userId: user.id,
      question: value(formData, "question"),
      answer: value(formData, "answer"),
      shortAnswer: value(formData, "shortAnswer") || null,
      category: value(formData, "category") || "general",
      sourceLinks: value(formData, "sourceLinks")
        .split(/\r?\n/)
        .map((item) => item.trim())
        .filter(Boolean),
      isPublished: formData.has("isPublished"),
      bandEligible: formData.has("bandEligible")
    });
  } catch (error) {
    redirectWithError(error);
  }
  refreshFaqPages();
  redirect(`/admin/faqs?message=${encodeURIComponent(id ? "FAQ updated." : "FAQ added.")}`);
}

export async function moveFaqAction(formData: FormData) {
  const user = await requireUser();
  const id = value(formData, "id");
  const direction = value(formData, "direction");
  const orderedIds = value(formData, "orderedIds").split(",").filter(Boolean);
  const currentIndex = orderedIds.indexOf(id);
  const nextIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
  if (currentIndex < 0 || nextIndex < 0 || nextIndex >= orderedIds.length) {
    redirect("/admin/faqs");
  }
  [orderedIds[currentIndex], orderedIds[nextIndex]] = [orderedIds[nextIndex]!, orderedIds[currentIndex]!];
  try {
    await reorderSalesFaqs({ userId: user.id, orderedIds });
  } catch (error) {
    redirectWithError(error);
  }
  refreshFaqPages();
  redirect(`/admin/faqs?message=${encodeURIComponent("FAQ order updated.")}`);
}

export async function deleteFaqAction(formData: FormData) {
  const user = await requireUser();
  try {
    await deleteSalesFaq({ userId: user.id, id: value(formData, "id") });
  } catch (error) {
    redirectWithError(error);
  }
  refreshFaqPages();
  redirect(`/admin/faqs?message=${encodeURIComponent("FAQ deleted.")}`);
}
