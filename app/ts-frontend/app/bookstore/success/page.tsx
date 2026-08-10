import { createHash } from "node:crypto";
import Link from "next/link";
import { getCurrentUser } from "../../../lib/auth/server";
import { PurchaseAnalytics } from "../../../components/commerce-analytics";
import { BookstoreCartClearer } from "../bookstore-catalog";

export default async function WorkbookPurchaseSuccessPage(
  props: { searchParams?: Promise<{ session_id?: string; returnPath?: string }> }
) {
  const searchParams = await props.searchParams;
  const user = await getCurrentUser();
  const returnPath = searchParams?.returnPath?.startsWith("/p/") ? searchParams.returnPath : null;
  const analyticsOrderId = searchParams?.session_id
    ? createHash("sha256").update(searchParams.session_id).digest("hex").slice(0, 24)
    : null;
  return <main className="grid min-h-screen place-items-center bg-[#f8f1e4] px-4 py-10 text-ink">{searchParams?.session_id ? <BookstoreCartClearer /> : null}{analyticsOrderId ? <PurchaseAnalytics dedupeKey={analyticsOrderId} item={{ itemId: "bookstore-order", itemName: "Treeschool workbook order", itemCategory: "workbook" }} /> : null}<section className="w-full max-w-xl rounded-[30px] border border-[#b8cf9f] bg-[#fffaf2] p-7 text-center shadow-[0_20px_60px_rgba(75,55,39,0.12)] sm:p-10"><div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[#e4efda] text-3xl text-[#4d6a39]">✓</div><h1 className="mt-5 text-4xl font-semibold tracking-[-0.05em]">Your workbooks are ready.</h1><p className="mt-4 leading-7 text-ink/65">We’re finalizing your purchase and emailing the secure PDF download links. Purchased workbooks selected during lesson planning are also added to that plan automatically.</p><div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">{returnPath ? <a href={returnPath} className="cta-button cta-button--dark">Return to lesson plan</a> : null}{user ? <Link href="/p/purchased-workbooks" className="cta-button cta-button--light">Purchased Workbooks</Link> : null}<Link href="/bookstore" className="cta-button cta-button--outline">Back to bookstore</Link></div></section></main>;
}
