import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "../../../lib/auth/server";
import {
  FAQ_CATEGORY_LABELS,
  listAdminSalesFaqs,
  type SalesFaq
} from "../../../lib/faqs/server";
import { deleteFaqAction, moveFaqAction, saveFaqAction } from "./actions";
import { FaqSubmitButton } from "./faq-submit-button";

export const dynamic = "force-dynamic";

type Props = { searchParams?: { error?: string; message?: string } };

function FaqFields({ faq, categories }: { faq?: SalesFaq; categories: string[] }) {
  return (
    <div className="grid gap-5">
      {faq ? <input type="hidden" name="id" value={faq.id} /> : null}
      <label className="grid gap-2 text-sm font-semibold">
        Question
        <input
          required
          name="question"
          defaultValue={faq?.question ?? ""}
          maxLength={240}
          placeholder="What might keep a parent from choosing Treeschool?"
          className="rounded-[14px] border border-[#dcc8aa] bg-white px-4 py-3"
        />
      </label>
      <label className="grid gap-2 text-sm font-semibold">
        Full answer
        <textarea
          required
          name="answer"
          defaultValue={faq?.answer ?? ""}
          rows={faq ? 7 : 5}
          maxLength={5000}
          placeholder="Answer the objection directly, specifically, and honestly."
          className="resize-y rounded-[14px] border border-[#dcc8aa] bg-white px-4 py-3 leading-7"
        />
        <span className="text-xs font-normal leading-5 text-ink/48">Blank lines become separate paragraphs on the public FAQ page.</span>
      </label>
      <label className="grid gap-2 text-sm font-semibold">
        Short answer for future landing-page bands
        <textarea
          name="shortAnswer"
          defaultValue={faq?.shortAnswer ?? ""}
          rows={2}
          maxLength={360}
          placeholder="A concise version of the answer."
          className="resize-y rounded-[14px] border border-[#dcc8aa] bg-white px-4 py-3"
        />
      </label>
      <div className="grid gap-5 md:grid-cols-2">
        <label className="grid gap-2 text-sm font-semibold">
          Objection category
          <select
            name="category"
            defaultValue={faq?.category ?? "general"}
            className="rounded-[14px] border border-[#dcc8aa] bg-white px-4 py-3 pr-12"
          >
            {categories.map((category) => (
              <option key={category} value={category}>{FAQ_CATEGORY_LABELS[category] ?? category}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          Evidence links
          <textarea
            name="sourceLinks"
            defaultValue={(faq?.sourceLinks ?? []).join("\n")}
            rows={3}
            placeholder={"One full URL per line\nhttps://…"}
            className="resize-y rounded-[14px] border border-[#dcc8aa] bg-white px-4 py-3 font-mono text-xs"
          />
        </label>
      </div>
      <div className="flex flex-wrap gap-5">
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" name="isPublished" defaultChecked={faq?.isPublished ?? true} className="h-5 w-5 accent-[#6f9853]" />
          Published on /faq
        </label>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" name="bandEligible" defaultChecked={faq?.bandEligible ?? false} className="h-5 w-5 accent-[#6f9853]" />
          Eligible for a landing-page objection band
        </label>
      </div>
    </div>
  );
}

export default async function AdminFaqsPage({ searchParams }: Props) {
  const user = await getCurrentUser();
  if (!user?.id) redirect("/p/signin?next=/admin/faqs");
  let data;
  try {
    data = await listAdminSalesFaqs(user.id);
  } catch (error) {
    if (error instanceof Error && error.message === "Administrator access is required.") notFound();
    throw error;
  }
  const orderedIds = data.faqs.map((faq) => faq.id).join(",");

  return (
    <main className="min-h-screen bg-[#f8f1e4] px-4 py-8 text-ink sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#567b40]">Treeschool administration</p>
            <h1 className="mt-2 text-4xl font-semibold tracking-[-0.055em] sm:text-6xl">Sales FAQs</h1>
            <p className="mt-3 max-w-3xl text-base leading-7 text-ink/62">
              Answer the objections that prevent a good-fit parent from buying. The same records can later supply focused objection bands on landing pages.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/faq" className="cta-button cta-button--outline cta-button--small">View public FAQ</Link>
            <Link href="/admin" className="cta-button cta-button--outline cta-button--small">Back to Admin</Link>
          </div>
        </header>

        {searchParams?.message ? <div className="mt-6 rounded-[18px] border border-[#b8cf9f] bg-[#eef5e4] px-5 py-4 text-sm font-semibold text-[#4d6a39]">{searchParams.message}</div> : null}
        {searchParams?.error ? <div role="alert" className="mt-6 rounded-[18px] border border-[#d9afa2] bg-[#fff1ec] px-5 py-4 text-sm font-semibold text-[#8b3e2f]">{searchParams.error}</div> : null}

        <section className="mt-8 grid gap-4 sm:grid-cols-3">
          {[
            ["Published", data.faqs.filter((faq) => faq.isPublished).length],
            ["Band eligible", data.faqs.filter((faq) => faq.bandEligible).length],
            ["Total objections", data.faqs.length]
          ].map(([label, count]) => (
            <div key={label} className="rounded-[22px] border border-[#c9d9b7] bg-[#f3f8ed] px-5 py-5">
              <p className="text-xs font-black uppercase tracking-[0.12em] text-[#567b40]">{label}</p>
              <p className="mt-2 text-4xl font-semibold tracking-[-0.06em]">{count}</p>
            </div>
          ))}
        </section>

        <details className="mt-8 rounded-[28px] border border-[#b8cf9f] bg-[#eef5e4] p-6 sm:p-8">
          <summary className="cursor-pointer list-none text-2xl font-semibold tracking-[-0.035em] marker:content-none">
            <span className="flex items-center justify-between gap-4">Add an objection <span aria-hidden="true" className="text-[#567b40]">＋</span></span>
          </summary>
          <form action={saveFaqAction} className="mt-7 border-t border-[#c8d9b8] pt-7">
            <FaqFields categories={data.categories} />
            <div className="mt-6 flex justify-end"><FaqSubmitButton>Add FAQ</FaqSubmitButton></div>
          </form>
        </details>

        <section className="mt-9">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-3xl font-semibold tracking-[-0.04em]">Public order</h2>
              <p className="mt-2 text-sm leading-6 text-ink/55">Use the arrows to control the sequence. Unpublished items keep their place until you publish them.</p>
            </div>
          </div>
          <div className="mt-5 space-y-4">
            {data.faqs.map((faq, index) => (
              <article key={faq.id} className="rounded-[24px] border border-[#dcc8aa] bg-[#fffaf2] p-5 sm:p-6">
                <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="grid h-8 min-w-8 place-items-center rounded-full bg-[#f1e5d2] px-2 text-xs font-black text-earth">{index + 1}</span>
                      <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.1em] ${faq.isPublished ? "bg-[#dfead4] text-[#4d6a39]" : "bg-[#eeeae3] text-ink/45"}`}>{faq.isPublished ? "Published" : "Hidden"}</span>
                      <span className="rounded-full bg-[#f2e6d3] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.1em] text-earth">{FAQ_CATEGORY_LABELS[faq.category] ?? faq.category}</span>
                      {faq.bandEligible ? <span className="rounded-full bg-[#e8e6f2] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.1em] text-[#665b83]">Band eligible</span> : null}
                    </div>
                    <h3 className="mt-3 text-xl font-semibold leading-tight tracking-[-0.025em]">{faq.question}</h3>
                    <p className="mt-2 line-clamp-2 max-w-3xl text-sm leading-6 text-ink/58">{faq.shortAnswer || faq.answer}</p>
                  </div>
                  <div className="flex flex-none gap-2">
                    <form action={moveFaqAction}>
                      <input type="hidden" name="id" value={faq.id} />
                      <input type="hidden" name="direction" value="up" />
                      <input type="hidden" name="orderedIds" value={orderedIds} />
                      <button disabled={index === 0} aria-label={`Move ${faq.question} up`} className="grid h-10 w-10 place-items-center rounded-full border border-[#dcc8aa] bg-white font-bold text-earth disabled:cursor-not-allowed disabled:opacity-30">↑</button>
                    </form>
                    <form action={moveFaqAction}>
                      <input type="hidden" name="id" value={faq.id} />
                      <input type="hidden" name="direction" value="down" />
                      <input type="hidden" name="orderedIds" value={orderedIds} />
                      <button disabled={index === data.faqs.length - 1} aria-label={`Move ${faq.question} down`} className="grid h-10 w-10 place-items-center rounded-full border border-[#dcc8aa] bg-white font-bold text-earth disabled:cursor-not-allowed disabled:opacity-30">↓</button>
                    </form>
                  </div>
                </div>

                <details className="mt-5 border-t border-[#eadbc2] pt-4">
                  <summary className="cursor-pointer list-none text-sm font-semibold text-[#567b40] marker:content-none">Edit answer and publishing options ＋</summary>
                  <form action={saveFaqAction} className="mt-6">
                    <FaqFields faq={faq} categories={data.categories} />
                    <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                      <details>
                        <summary className="cursor-pointer text-sm font-semibold text-[#994b3a]">Delete FAQ</summary>
                        <div className="mt-3 rounded-[14px] border border-[#e1b7aa] bg-[#fff1ec] p-4">
                          <p className="text-sm text-[#7f3f32]">This permanently removes the objection and its landing-page eligibility.</p>
                          <button formAction={deleteFaqAction} name="id" value={faq.id} className="mt-3 rounded-full bg-[#994b3a] px-4 py-2 text-sm font-semibold text-white">Delete permanently</button>
                        </div>
                      </details>
                      <FaqSubmitButton>Save changes</FaqSubmitButton>
                    </div>
                  </form>
                </details>
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
