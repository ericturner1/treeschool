"use server";

import { redirect } from "next/navigation";
import {
  createAccountInvitation,
  updateAccountMemberRole,
  updateOwnAccountName
} from "../../../lib/accounts/server";
import {
  getCurrentUser,
  requestCurrentUserEmailChange,
  sendMagicLink
} from "../../../lib/auth/server";
import { getPublicAppOrigin } from "../../../lib/security/public-origin";

function field(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function accountPath(input: { lang?: string; error?: string; message?: string }) {
  const search = new URLSearchParams();
  if (input.lang) search.set("lang", input.lang);
  if (input.error) search.set("error", input.error);
  if (input.message) search.set("message", input.message);
  const query = search.toString();
  return query ? `/p/account?${query}` : "/p/account";
}

function requestOrigin() {
  return getPublicAppOrigin();
}

export async function requestEmailChangeAction(formData: FormData) {
  const lang = field(formData, "lang") || undefined;
  const newEmail = field(formData, "newEmail").toLowerCase();
  const confirmEmail = field(formData, "confirmEmail").toLowerCase();
  const user = await getCurrentUser();

  if (!user?.email) redirect(`/p/signin${lang ? `?lang=${encodeURIComponent(lang)}` : ""}`);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
    redirect(accountPath({ lang, error: "Enter a valid new email address." }));
  }
  if (newEmail !== confirmEmail) {
    redirect(accountPath({ lang, error: "The two new email addresses do not match." }));
  }
  if (newEmail === user.email.trim().toLowerCase()) {
    redirect(accountPath({ lang, error: "That is already your account email." }));
  }

  const next = accountPath({
    lang,
    message: "Email confirmation received. If another confirmation email is waiting, approve that one too."
  });
  const callback = new URL("/auth/confirm", requestOrigin());
  callback.searchParams.set("purpose", "email-change");
  callback.searchParams.set("next", next);

  const result = await requestCurrentUserEmailChange(newEmail, callback.toString());
  if (!result.ok) redirect(accountPath({ lang, error: result.error }));

  redirect(accountPath({
    lang,
    message: "Check your new inbox and your current inbox to confirm the email change."
  }));
}

export async function updateAccountNameAction(formData: FormData) {
  const lang = field(formData, "lang") || undefined;
  const name = field(formData, "name");
  const user = await getCurrentUser();
  if (!user?.id) redirect(`/p/signin${lang ? `?lang=${encodeURIComponent(lang)}` : ""}`);
  try {
    await updateOwnAccountName({ userId: user.id, name });
  } catch (error) {
    redirect(accountPath({
      lang,
      error: error instanceof Error ? error.message : "Could not update your name."
    }));
  }
  redirect(accountPath({ lang, message: "Your name has been updated." }));
}

export type InviteTeacherState = {
  status: "idle" | "success" | "error";
  message: string;
  requestId: number;
};

export async function inviteTeacherAction(
  _previousState: InviteTeacherState,
  formData: FormData
): Promise<InviteTeacherState> {
  const lang = field(formData, "lang") || undefined;
  const name = field(formData, "name");
  const email = field(formData, "email").toLowerCase();
  const user = await getCurrentUser();
  if (!user?.id) redirect(`/p/signin${lang ? `?lang=${encodeURIComponent(lang)}` : ""}`);

  try {
    await createAccountInvitation({ userId: user.id, name, email });
    const callback = new URL("/auth/confirm", requestOrigin());
    callback.searchParams.set("next", "/p/dashboard");
    const result = await sendMagicLink(email, callback.toString(), { createUser: true });
    if (!result.ok) throw new Error(result.error);
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Could not send the invitation.",
      requestId: Date.now()
    };
  }

  return {
    status: "success",
    message: `Invitation sent to ${email}. They can use the secure link in that email to join as a teacher.`,
    requestId: Date.now()
  };
}

export async function updateAccountRoleAction(formData: FormData) {
  const lang = field(formData, "lang") || undefined;
  const profileId = field(formData, "profileId");
  const role = field(formData, "role");
  const requestedReturnPath = field(formData, "returnPath");
  const returnPath = /^\/p\/account\/teachers\/[0-9a-f-]{36}$/i.test(requestedReturnPath)
    ? requestedReturnPath
    : "/p/account";
  const resultPath = (key: "error" | "message", value: string) => {
    const search = new URLSearchParams({ [key]: value });
    if (lang) search.set("lang", lang);
    return `${returnPath}?${search.toString()}`;
  };
  const user = await getCurrentUser();
  if (!user?.id) redirect(`/p/signin${lang ? `?lang=${encodeURIComponent(lang)}` : ""}`);
  if (role !== "ADMIN" && role !== "TEACHER") {
    redirect(resultPath("error", "Choose a valid account role."));
  }
  try {
    await updateAccountMemberRole({ userId: user.id, profileId, role });
  } catch (error) {
    redirect(resultPath("error", error instanceof Error ? error.message : "Could not update the account role."));
  }
  redirect(resultPath("message", "Account role updated."));
}
