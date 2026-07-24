import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  requestPasswordlessSignInAction,
  verifyEmailCodeAction
} from "../auth/actions";
import { getRequestDictionary } from "../../lib/i18n/server";
import { getCurrentUser } from "../../lib/auth/server";

type SigninPageProps = {
  searchParams?: {
    lang?: string;
    email?: string;
    account?: string;
    error?: string;
    message?: string;
    next?: string;
    sent?: string;
  };
};

function safeNext(value?: string) {
  return value && value.startsWith("/") && !value.startsWith("//")
    ? value
    : "/p/dashboard";
}

export default async function SigninPage({ searchParams }: SigninPageProps) {
  const currentUser = await getCurrentUser();

  if (currentUser) {
    redirect("/p/dashboard");
  }

  const { locale, dictionary } = await getRequestDictionary(searchParams?.lang);
  const { auth, home } = dictionary;
  const headerStore = headers();
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host") ?? "localhost:3100";
  const protocol = headerStore.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;
  const email = searchParams?.email?.trim() ?? "";
  const next = safeNext(searchParams?.next);
  const sent = searchParams?.sent === "1" && Boolean(email);
  const accountMissing = searchParams?.account === "missing";

  return (
    <main className="min-h-screen bg-[#f8f1e4] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-2xl flex-col items-center justify-start pt-3 sm:pt-4">
        <Link href="/" className="inline-flex flex-col items-center gap-0.5 text-[28px] font-semibold tracking-[-0.05em] text-ink">
          <img src="/tree-icon.png" alt="treeschool tree icon" className="h-20 w-20 object-contain" />
          <span className="brand-logo">{home.brand.name}</span>
        </Link>

        <section className="site-panel mt-3 w-full max-w-xl rounded-[32px] px-5 py-6 sm:mt-4 sm:px-7 sm:py-7">
          <p className="text-center text-4xl font-semibold tracking-[-0.05em] text-ink sm:text-5xl">
            {sent ? "Check your email" : "Welcome back"}
          </p>
          <p className="mt-2 text-center text-lg leading-[1.6] text-ink/76 sm:text-[21px]">
            {sent
              ? `We sent a secure sign-in link and code to ${email}.`
              : "Enter the email associated with your Treeschool account—no password required."}
          </p>

          {accountMissing ? (
            <div className="mt-5 rounded-[20px] border border-[#d6c19e] bg-[#fff7e7] px-5 py-4 text-center">
              <p className="font-semibold text-ink">We couldn’t find a Treeschool account for that email.</p>
              <p className="mt-1.5 text-sm leading-6 text-ink/65">Starting the Family Plan creates your parent account automatically.</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Link href="/pricing" className="cta-button cta-button--dark cta-button--small">See the Family Plan</Link>
                <Link href="/homeschool-lesson-plan-generator" className="cta-button cta-button--light cta-button--small">Start a lesson plan</Link>
              </div>
            </div>
          ) : null}

          {searchParams?.message ? (
            <p className="mt-5 rounded-[18px] border border-[#b8cf9f] bg-[#eef5e4] px-4 py-3 text-sm font-semibold text-[#4d6a39]">
              {searchParams.message}
            </p>
          ) : null}
          {searchParams?.error ? (
            <p role="alert" className="mt-5 rounded-[18px] border border-[#d9afa2] bg-[#fff1ec] px-4 py-3 text-sm font-semibold text-[#8b3e2f]">
              {searchParams.error}
            </p>
          ) : null}

          {sent ? (
            <>
              <form action={verifyEmailCodeAction} className="mt-5 space-y-4">
                <input type="hidden" name="lang" value={locale} />
                <input type="hidden" name="email" value={email} />
                <input type="hidden" name="next" value={next} />
                <label htmlFor="token" className="block text-sm font-semibold text-ink">
                  Sign-in code
                  <input
                    id="token"
                    name="token"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9 ]{6,11}"
                    required
                    autoFocus
                    placeholder="123456"
                    className="mt-2 min-h-14 w-full rounded-[18px] border border-[#dcc8aa] bg-white px-4 text-center text-xl tracking-[0.24em] text-ink outline-none focus:border-[#8f6544]"
                  />
                </label>
                <button type="submit" className="cta-button cta-button--dark w-full">Verify and sign in</button>
              </form>

              <form action={requestPasswordlessSignInAction} className="mt-3">
                <input type="hidden" name="lang" value={locale} />
                <input type="hidden" name="email" value={email} />
                <input type="hidden" name="next" value={next} />
                <input type="hidden" name="origin" value={origin} />
                <button type="submit" className="w-full text-sm font-semibold text-earth underline underline-offset-4">
                  Resend email
                </button>
              </form>
              <Link href={{ pathname: "/signin", query: { next } }} className="mt-3 block text-center text-sm text-ink/60 underline underline-offset-4">
                Use a different email
              </Link>
            </>
          ) : (
            <form action={requestPasswordlessSignInAction} autoComplete="on" className="mt-5 space-y-4">
              <input type="hidden" name="lang" value={locale} />
              <input type="hidden" name="next" value={next} />
              <input type="hidden" name="origin" value={origin} />
              <label htmlFor="email" className="block text-sm font-semibold text-ink">
                {auth.fields.email}
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  defaultValue={email}
                  placeholder="parent@example.com"
                  className="mt-2 min-h-14 w-full rounded-[18px] border border-[#dcc8aa] bg-white px-4 text-base text-ink outline-none focus:border-[#8f6544]"
                />
              </label>
              <button type="submit" className="cta-button cta-button--dark w-full">Continue with email</button>
              <p className="text-center text-xs leading-5 text-ink/55">
                We’ll email a one-time link and code if this email has a Treeschool account.
              </p>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}
