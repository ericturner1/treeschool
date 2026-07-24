"use client";

import { useState } from "react";
import { createManualBlogPostAction, generateBlogDraftAction } from "../actions";

export function BlogStartForm() {
  const [mode, setMode] = useState<"manual" | "ai">("manual");
  return (
    <div>
      <div className="grid gap-3 rounded-[18px] bg-[#eee5d8] p-1.5 sm:grid-cols-2" role="tablist" aria-label="Writing method">
        <button type="button" role="tab" aria-selected={mode === "manual"} onClick={() => setMode("manual")} className={`rounded-[14px] px-5 py-4 text-left transition ${mode === "manual" ? "bg-white shadow-sm" : "text-ink/58"}`}><span className="block font-semibold">Write manually</span><span className="mt-1 block text-xs leading-5">Start with a clean editor and write in your own voice.</span></button>
        <button type="button" role="tab" aria-selected={mode === "ai"} onClick={() => setMode("ai")} className={`rounded-[14px] px-5 py-4 text-left transition ${mode === "ai" ? "bg-white shadow-sm" : "text-ink/58"}`}><span className="block font-semibold">Generate an AI draft</span><span className="mt-1 block text-xs leading-5">Turn a careful editorial brief into a reviewable first draft.</span></button>
      </div>

      {mode === "manual" ? (
        <form action={createManualBlogPostAction} className="mt-7 space-y-5">
          <label className="grid gap-2 text-sm font-semibold">Working title <span className="text-xs font-normal text-ink/48">You can change this later.</span><input name="title" required maxLength={180} placeholder="Example: How to choose a homeschool curriculum" className="min-h-14 rounded-[16px] border border-[#dcc8aa] bg-white px-4 text-base" /></label>
          <button className="cta-button cta-button--light" type="submit">Open writing editor</button>
        </form>
      ) : (
        <form action={generateBlogDraftAction} className="mt-7 grid gap-5">
          <div className="rounded-[16px] border border-[#c8d8b8] bg-[#f1f7e9] px-4 py-3 text-sm leading-6 text-[#4d6a39]"><strong>AI creates a draft, not a published article.</strong> Treeschool preserves the generation record, and a human must review and explicitly publish it.</div>
          <label className="grid gap-2 text-sm font-semibold">Article topic and goal<textarea name="topic" required rows={3} maxLength={500} placeholder="Explain what the article should help the reader understand or accomplish." className="rounded-[16px] border border-[#dcc8aa] bg-white px-4 py-3 text-base leading-7" /></label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-semibold">Audience<input name="audience" defaultValue="Homeschool parents researching curriculum and planning" maxLength={240} className="min-h-14 rounded-[16px] border border-[#dcc8aa] bg-white px-4" /></label>
            <label className="grid gap-2 text-sm font-semibold">Primary search phrase<input name="primaryKeyword" maxLength={120} placeholder="homeschool curriculum planning" className="min-h-14 rounded-[16px] border border-[#dcc8aa] bg-white px-4" /></label>
          </div>
          <label className="grid gap-2 text-sm font-semibold">Facts, angle, and boundaries <span className="text-xs font-normal text-ink/48">Give the model factual material and tell it what not to claim.</span><textarea name="angle" rows={4} maxLength={600} className="rounded-[16px] border border-[#dcc8aa] bg-white px-4 py-3 text-base leading-7" /></label>
          <label className="grid max-w-sm gap-2 text-sm font-semibold">Depth<select name="desiredLength" defaultValue="standard" className="min-h-14 rounded-[16px] border border-[#dcc8aa] bg-white px-4 pr-12"><option value="short">Focused · about 800 words</option><option value="standard">Standard · about 1,400 words</option><option value="deep">In depth · about 2,200 words</option></select></label>
          <button className="cta-button cta-button--light justify-self-start" type="submit">Generate editable draft</button>
        </form>
      )}
    </div>
  );
}
