import { canSignInWithParentEmail } from "../accounts/server";
import { sendMagicLink } from "./server";

export const MOBILE_APP_AUTH_REDIRECT_URL =
  "com.treehomeschool.app://login-callback";

type MobileSignInDependencies = {
  canSignIn: (email: string) => Promise<boolean>;
  sendCode: (
    email: string,
    redirectTo: string,
    options: { createUser: boolean },
  ) => Promise<{ ok: boolean; error?: string }>;
};

const defaultDependencies: MobileSignInDependencies = {
  canSignIn: canSignInWithParentEmail,
  sendCode: sendMagicLink,
};

export function normalizeMobileSignInEmail(value: unknown) {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

export async function requestMobileSignInCode(
  input: { email: string },
  dependencies: MobileSignInDependencies = defaultDependencies,
) {
  if (!(await dependencies.canSignIn(input.email))) {
    return { ok: false as const, status: 404, error: "No Treeschool parent account was found for this email." };
  }

  const result = await dependencies.sendCode(
    input.email,
    MOBILE_APP_AUTH_REDIRECT_URL,
    { createUser: false },
  );

  return result.ok
    ? { ok: true as const, status: 200 }
    : {
        ok: false as const,
        status: 502,
        error: result.error ?? "Could not send the sign-in email.",
      };
}
