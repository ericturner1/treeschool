"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createPortal, useFormStatus } from "react-dom";
import { startWorkbookCartCheckoutAction } from "./actions";

const CART_STORAGE_KEY = "treeschool:bookstore-cart:v1";
const MAX_CART_ITEMS = 10;

export type BookstoreCatalogItem = {
  id: string;
  catalogKind: "workbook" | "bundle";
  memberCount: number;
  slug: string;
  title: string;
  thumbnailUrl: string | null;
  priceInCents: number;
  currencyCode: string;
  accessState: "owned" | "included" | "purchase_required";
};

function formatPrice(priceInCents: number, currencyCode: string) {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency: currencyCode,
    minimumFractionDigits: 2
  }).format(priceInCents / 100);
}

function CheckoutButton({ total }: { total: string }) {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending} className="cta-button cta-button--dark w-full justify-center disabled:opacity-60">
      {pending ? <><span className="h-5 w-5 animate-spin rounded-full border-2 border-white/35 border-t-white" /> Opening Stripe…</> : `Checkout with Stripe · ${total}`}
    </button>
  );
}

export function BookstoreCatalog({
  visibleWorkbooks,
  catalogWorkbooks,
  userEmail
}: {
  visibleWorkbooks: BookstoreCatalogItem[];
  catalogWorkbooks: BookstoreCatalogItem[];
  userEmail: string | null;
}) {
  const [cartIds, setCartIds] = useState<string[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [headerActions, setHeaderActions] = useState<HTMLElement | null>(null);
  const catalogById = useMemo(() => new Map(catalogWorkbooks.map((workbook) => [workbook.id, workbook])), [catalogWorkbooks]);

  useEffect(() => {
    try {
      const stored = JSON.parse(window.localStorage.getItem(CART_STORAGE_KEY) ?? "[]") as unknown;
      const ids = Array.isArray(stored) ? stored.map(String) : [];
      setCartIds(Array.from(new Set(ids)).filter((id) => catalogById.get(id)?.accessState !== "owned").slice(0, MAX_CART_ITEMS));
    } catch {
      setCartIds([]);
    }
    setHeaderActions(document.getElementById("bookstore-header-actions"));
    setLoaded(true);
  }, [catalogById]);

  useEffect(() => {
    if (!loaded) return;
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cartIds));
  }, [cartIds, loaded]);

  const cartItems = cartIds.flatMap((id) => {
    const workbook = catalogById.get(id);
    return workbook ? [workbook] : [];
  });
  const totalInCents = cartItems.reduce((sum, workbook) => sum + workbook.priceInCents, 0);
  const currencyCode = cartItems[0]?.currencyCode ?? "USD";
  const total = formatPrice(totalInCents, currencyCode);

  function addToCart(workbookId: string) {
    setCartIds((current) => current.includes(workbookId) || current.length >= MAX_CART_ITEMS
      ? current
      : [...current, workbookId]);
  }

  function removeFromCart(workbookId: string) {
    setCartIds((current) => current.filter((id) => id !== workbookId));
  }

  return (
    <>
      {headerActions && cartItems.length > 0 ? createPortal(
        <button
          type="button"
          onClick={() => setCartOpen(true)}
          className="relative grid h-11 w-11 place-items-center rounded-full border border-[#dcc8aa] bg-white text-ink shadow-[0_3px_0_#dcc8aa] transition hover:-translate-y-0.5 hover:bg-[#fffaf2]"
          aria-label={`Open cart with ${cartItems.length} ${cartItems.length === 1 ? "item" : "items"}`}
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
            <path d="M3.5 4.5h2l1.7 10.1a2 2 0 0 0 2 1.7h7.9a2 2 0 0 0 1.9-1.5l1.2-6.6H6.1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="9.3" cy="19.3" r="1.2" fill="currentColor" />
            <circle cx="17.2" cy="19.3" r="1.2" fill="currentColor" />
          </svg>
          <span className="absolute -right-1 -top-1 grid min-h-5 min-w-5 place-items-center rounded-full bg-[#567b40] px-1 text-[10px] font-black leading-none text-white">{cartItems.length}</span>
        </button>,
        headerActions
      ) : null}

      {visibleWorkbooks.length ? (
        <section className="mt-8 grid justify-items-center gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-4">
          {visibleWorkbooks.map((workbook) => {
            const inCart = cartIds.includes(workbook.id);
            const owned = workbook.accessState === "owned";
            const cartFull = cartIds.length >= MAX_CART_ITEMS && !inCart;
            return (
              <article key={workbook.id} className="flex min-h-48 w-full max-w-60 flex-col items-center px-1 py-2 text-center">
                <Link href={`/bookstore/${workbook.slug}`} className="relative mb-5 block aspect-[3/4] w-full max-w-44 overflow-hidden rounded-[14px] bg-white shadow-[0_8px_20px_rgba(80,58,39,0.10)] transition hover:-translate-y-0.5 hover:shadow-[0_12px_26px_rgba(80,58,39,0.15)]" aria-label={`View ${workbook.title}`}>
                  <span className="absolute inset-0 grid place-items-center text-[#a9835c]" aria-hidden="true">
                    <svg viewBox="0 0 48 48" className="h-14 w-14" fill="none">
                      <path d="M10 8.5A4.5 4.5 0 0 1 14.5 4H38v34H14.5A4.5 4.5 0 0 0 10 42.5v-34Z" fill="currentColor" opacity=".18" />
                      <path d="M10 8.5A4.5 4.5 0 0 1 14.5 4H38v34H14.5A4.5 4.5 0 0 0 10 42.5m0-34v34m0 0A4.5 4.5 0 0 1 14.5 38H38M16 12h15M16 18h11" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  {workbook.thumbnailUrl ? <Image src={workbook.thumbnailUrl} alt={`${workbook.title} cover`} fill unoptimized className="object-cover" onError={(event) => { event.currentTarget.style.display = "none"; }} /> : null}
                </Link>
                <Link href={`/bookstore/${workbook.slug}`} className="text-2xl font-semibold leading-tight tracking-[-0.035em] hover:text-[#567b40] hover:underline hover:underline-offset-4">{workbook.title}</Link>
                {workbook.catalogKind === "bundle" ? <p className="mt-2 rounded-full bg-[#e7f0de] px-3 py-1 text-xs font-black text-[#4f7339]">Bundle · {workbook.memberCount} workbooks</p> : null}
                <p className="mt-3 text-xl font-normal">{formatPrice(workbook.priceInCents, workbook.currencyCode)}</p>
                <button
                  type="button"
                  disabled={owned || inCart || cartFull}
                  onClick={() => addToCart(workbook.id)}
                  className="cta-button cta-button--outline cta-button--small mt-auto disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {owned ? "Already owned" : inCart ? "Added to cart ✓" : cartFull ? "Cart full" : "Add to cart"}
                </button>
              </article>
            );
          })}
        </section>
      ) : (
        <section className="mt-8 px-6 py-14 text-center"><h2 className="text-2xl font-semibold">No workbooks match those filters yet.</h2><p className="mt-2 text-ink/58">Our library is growing. Try another grade or subject.</p></section>
      )}

      {cartOpen ? (
        <div className="fixed inset-0 z-[120] flex justify-end bg-black/45" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCartOpen(false); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="bookstore-cart-title" className="flex h-full w-full max-w-lg flex-col overflow-y-auto bg-[#fffaf2] p-6 shadow-2xl sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div><p className="text-xs font-black uppercase tracking-[0.14em] text-earth">Treeschool bookstore</p><h2 id="bookstore-cart-title" className="mt-2 text-4xl font-semibold tracking-[-0.05em]">Your cart</h2></div>
              <button type="button" onClick={() => setCartOpen(false)} className="grid h-11 w-11 place-items-center rounded-full border border-[#dcc8aa] bg-white text-2xl" aria-label="Close cart">×</button>
            </div>

            {cartItems.length ? (
              <>
                <div className="mt-8 grid gap-5">
                  {cartItems.map((workbook) => (
                    <div key={workbook.id} className="flex items-start justify-between gap-4 border-b border-[#e4d4bb] pb-5">
                      <div><p className="font-semibold leading-6">{workbook.title}</p>{workbook.catalogKind === "bundle" ? <p className="mt-1 text-xs font-semibold text-[#567b40]">Bundle · {workbook.memberCount} workbooks</p> : null}<p className="mt-1 text-sm text-ink/58">{formatPrice(workbook.priceInCents, workbook.currencyCode)}</p></div>
                      <button type="button" onClick={() => removeFromCart(workbook.id)} className="text-sm font-semibold text-[#8b3e2f] underline underline-offset-4">Remove</button>
                    </div>
                  ))}
                </div>
                <div className="mt-auto pt-8">
                  <div className="mb-5 flex items-center justify-between text-xl"><span className="font-semibold">Total</span><strong>{total}</strong></div>
                  <form action={startWorkbookCartCheckoutAction}>
                    {cartItems.map((workbook) => <input key={workbook.id} type="hidden" name="workbookId" value={workbook.id} />)}
                    {userEmail ? <input type="hidden" name="email" value={userEmail} /> : <label className="mb-4 grid gap-2 text-sm font-semibold">Delivery email<input required name="email" type="email" autoComplete="email" className="rounded-[14px] border border-[#dcc8aa] bg-white px-4 py-3" /></label>}
                    <CheckoutButton total={total} />
                    <p className="mt-3 text-center text-xs leading-5 text-ink/50">Secure checkout by Stripe. Download links will be emailed after payment.</p>
                  </form>
                </div>
              </>
            ) : (
              <div className="grid flex-1 place-items-center text-center"><div><p className="text-2xl font-semibold">Your cart is empty.</p><button type="button" onClick={() => setCartOpen(false)} className="cta-button cta-button--outline mt-5">Browse workbooks</button></div></div>
            )}
          </section>
        </div>
      ) : null}
    </>
  );
}

export function BookstoreCartClearer() {
  useEffect(() => {
    window.localStorage.removeItem(CART_STORAGE_KEY);
  }, []);
  return null;
}
