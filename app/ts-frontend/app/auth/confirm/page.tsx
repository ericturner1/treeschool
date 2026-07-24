import Link from "next/link";
import { verifyEmailTokenHashAction } from "../actions";
import { HashSessionCompleter } from "./hash-session-completer";

type ConfirmPageProps = {
  searchParams?: {
    token_hash?: string;
    next?: string;
    lang?: string;
    purpose?: string;
    confirmed?: string;
    error?: string;
  };
};

function safeNext(value?: string) {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/p/dashboard";
}

export default function ConfirmEmailPage({ searchParams }: ConfirmPageProps) {
  const tokenHash = searchParams?.token_hash ?? "";
  const next = safeNext(searchParams?.next);
  const isEmailChange = searchParams?.purpose === "email-change";
  const isPartiallyConfirmed = isEmailChange && searchParams?.confirmed === "1";
  const hasEmailChangeError = isEmailChange && Boolean(searchParams?.error);
  const isWaitingForEmailChangeHash = isEmailChange && !tokenHash && !searchParams?.error;
  const isWaitingForSignInHash = !isEmailChange && !tokenHash;
  const title = isPartiallyConfirmed
    ? "One address confirmed"
    : hasEmailChangeError
      ? "Email change not confirmed"
      : isEmailChange
        ? "Confirm email change"
        : "Finish signing in";
  const description = isPartiallyConfirmed
    ? "Now approve the confirmation message in your other inbox. Your sign-in email will change after both addresses are confirmed."
    : hasEmailChangeError
      ? "This link may have expired or already been used. Return to your Account page to request another email change."
      : isWaitingForEmailChangeHash
        ? "Finishing your email confirmation…"
        : isWaitingForSignInHash
          ? "Finishing your secure sign-in. You’ll be redirected automatically when it is ready."
          : isEmailChange
            ? "Select the button below to approve this address. If another confirmation message is waiting in the other inbox, approve that one too."
            : "Select the button below to finish. This extra step prevents email security scanners from using your one-time link before you do.";

  return (
    <main className="min-h-screen bg-[#f8f1e4] px-4 py-16">
      <section className="site-panel mx-auto max-w-xl rounded-[32px] px-6 py-9 text-center sm:px-8">
        <Link href="/" className="brand-logo text-3xl font-semibold text-ink">treeschool</Link>
        <h1 className="mt-6 text-4xl font-semibold tracking-[-0.05em] text-ink">{title}</h1>
        <p className="mt-3 text-base leading-7 text-ink/70">{description}</p>
        {!tokenHash && !isPartiallyConfirmed && !hasEmailChangeError ? (
          <HashSessionCompleter
            next={next}
            emailChange={isEmailChange}
          />
        ) : null}
        {isPartiallyConfirmed || hasEmailChangeError ? (
          <a href={next} className="cta-button cta-button--dark mt-7 w-full">
            Return to Treeschool
          </a>
        ) : tokenHash ? (
          <form action={verifyEmailTokenHashAction} className="mt-7">
            <input type="hidden" name="tokenHash" value={tokenHash} />
            <input type="hidden" name="tokenType" value={isEmailChange ? "email_change" : ""} />
            <input type="hidden" name="next" value={next} />
            <input type="hidden" name="lang" value={searchParams?.lang ?? ""} />
            <button type="submit" className="cta-button cta-button--dark w-full">
              {isEmailChange ? "Confirm email address" : "Sign in to Treeschool"}
            </button>
          </form>
        ) : null}
        {searchParams?.error ? (
          <p role="alert" className="mt-4 text-sm font-semibold text-[#8b3e2f]">{searchParams.error}</p>
        ) : null}
      </section>
    </main>
  );
}
