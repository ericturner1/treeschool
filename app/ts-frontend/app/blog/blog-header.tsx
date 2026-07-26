import Image from "next/image";
import Link from "next/link";
import { getCurrentUser } from "../../lib/auth/server";

export async function BlogHeader() {
  const currentUser = await getCurrentUser();
  return <header className="border-b border-[#ddccb2] bg-[#fffaf2]"><div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8"><Link href="/" className="flex items-center"><Image src="/tree-icon.png" alt="Treeschool tree icon" width={64} height={64} className="h-14 w-14 object-contain" /><span className="brand-logo text-[27px] font-semibold">treeschool</span></Link><nav aria-label="Main navigation" className="flex items-center gap-4 text-sm font-semibold text-ink/65 sm:gap-6"><Link href="/blog" className="text-[#486338]">Blog</Link><Link href="/bookstore" className="hidden sm:inline">Bookstore</Link><Link href="/pricing" className="hidden sm:inline">Pricing</Link><Link href={currentUser ? "/p/dashboard" : "/p/signin"}>{currentUser ? "Dashboard" : "Sign in"}</Link></nav></div></header>;
}
