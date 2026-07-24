import Link from "next/link";
import { SUPPORT_EMAIL } from "../../lib/site";

export default function SupportPage() {
  return <main className="min-h-screen bg-[#f8f1e4] px-4 py-16"><section className="site-panel mx-auto max-w-2xl rounded-[32px] px-6 py-10 text-center sm:px-9">
    <Link href="/" className="brand-logo text-3xl font-semibold text-ink">treeschool</Link>
    <h1 className="mt-7 text-4xl font-semibold tracking-[-0.05em] text-ink">How can we help?</h1>
    <p className="mt-4 text-lg leading-8 text-ink/72">For account, payment, upload, or printable-plan help, email us. Include the email used at checkout, but never send passwords, sign-in codes, or complete card details.</p>
    <a href={`mailto:${SUPPORT_EMAIL}?subject=Treeschool%20support`} className="cta-button cta-button--dark mt-7">Email {SUPPORT_EMAIL}</a>
    <div className="mt-8 flex justify-center gap-5 text-sm"><Link className="text-earth underline" href="/privacy">Privacy</Link><Link className="text-earth underline" href="/terms">Terms</Link><Link className="text-earth underline" href="/refunds">Refunds</Link></div>
  </section></main>;
}
