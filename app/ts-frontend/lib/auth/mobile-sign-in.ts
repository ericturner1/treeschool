import {
  canSignInWithParentEmail,
  ensureProvisionalParentAccount,
} from "../accounts/server";
import { sendMagicLink } from "./server";

export const MOBILE_APP_AUTH_REDIRECT_URL =
  "com.treehomeschool.app://login-callback";

type MobileSignInDependencies = {
  canSignIn: (email: string) => Promise<boolean>;
  prepareSignUp: (email: string) => Promise<unknown>;
  sendCode: (
    email: string,
    redirectTo: string,
    options: { createUser: boolean },
  ) => Promise<{ ok: boolean; error?: string }>;
};

const defaultDependencies: MobileSignInDependencies = {
  canSignIn: canSignInWithParentEmail,
  prepareSignUp: ensureProvisionalParentAccount,
  sendCode: sendMagicLink,
};

export function normalizeMobileSignInEmail(value: unknown) {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

export async function requestMobileSignInCode(
  input: { email: string; mode?: "sign_in" | "sign_up" },
  dependencies: MobileSignInDependencies = defaultDependencies,
) {
  const isSignUp = input.mode === "sign_up";
  if (isSignUp) {
    await dependencies.prepareSignUp(input.email);
  } else if (!(await dependencies.canSignIn(input.email))) {
    return { ok: false as const, status: 404, error: "No Treeschool parent account was found for this email." };
  }

  const result = await dependencies.sendCode(
    input.email,
    MOBILE_APP_AUTH_REDIRECT_URL,
    { createUser: isSignUp },
  );

  return result.ok
    ? { ok: true as const, status: 200 }
    : {
        ok: false as const,
        status: 502,
        error: result.error ?? "Could not send the sign-in email.",
      };
}
