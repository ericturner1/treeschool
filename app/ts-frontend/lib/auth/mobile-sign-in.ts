import { canSignInWithParentEmail } from "../accounts/server";
import { getPublicAppOrigin } from "../security/public-origin";
import { sendMagicLink } from "./server";

type MobileSignInDependencies = {
  canSignIn: (email: string) => Promise<boolean>;
  sendCode: (
    email: string,
    redirectTo: string,
    options: { createUser: boolean },
  ) => Promise<{ ok: boolean; error?: string }>;
  publicOrigin: (requestUrl?: string | URL) => string;
};

const defaultDependencies: MobileSignInDependencies = {
  canSignIn: canSignInWithParentEmail,
  sendCode: sendMagicLink,
  publicOrigin: getPublicAppOrigin,
};

export function normalizeMobileSignInEmail(value: unknown) {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

export async function requestMobileSignInCode(
  input: { email: string; requestUrl: string },
  dependencies: MobileSignInDependencies = defaultDependencies,
) {
  if (!(await dependencies.canSignIn(input.email))) {
    return { ok: false as const, status: 404, error: "No Treeschool parent account was found for this email." };
  }

  const redirectTo = `${dependencies.publicOrigin(input.requestUrl)}/auth/confirm?next=${encodeURIComponent("/p/dashboard")}`;
  const result = await dependencies.sendCode(input.email, redirectTo, {
    createUser: false,
  });

  return result.ok
    ? { ok: true as const, status: 200 }
    : {
        ok: false as const,
        status: 502,
        error: result.error ?? "Could not send the sign-in email.",
      };
}
