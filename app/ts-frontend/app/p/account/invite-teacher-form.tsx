"use client";

import { useEffect, useRef } from "react";
import { useFormState } from "react-dom";
import { useRouter } from "next/navigation";
import { inviteTeacherAction, type InviteTeacherState } from "./actions";
import { AccountSubmitButton } from "./account-submit-button";

const initialState: InviteTeacherState = {
  status: "idle",
  message: "",
  requestId: 0
};

export function InviteTeacherForm({ lang }: { lang?: string }) {
  const [state, formAction] = useFormState(inviteTeacherAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const handledRequestId = useRef(0);
  const router = useRouter();

  useEffect(() => {
    if (state.status !== "success" || state.requestId === handledRequestId.current) return;
    handledRequestId.current = state.requestId;
    formRef.current?.reset();
    router.refresh();
  }, [router, state.requestId, state.status]);

  return (
    <form ref={formRef} action={formAction} className="mt-7 rounded-[24px] bg-[#eef5e4] p-5">
      <input type="hidden" name="lang" value={lang ?? ""} />
      <h3 className="text-xl font-semibold text-ink">Invite a teacher</h3>
      <p className="mt-1 text-sm leading-6 text-ink/62">
        We’ll email them a secure magic link. Their invitation expires after seven days, and sending it again refreshes the link.
      </p>
      {state.status !== "idle" ? (
        <div
          role={state.status === "error" ? "alert" : "status"}
          aria-live="polite"
          className={`mt-4 rounded-[18px] border px-4 py-3 text-sm font-semibold leading-6 ${
            state.status === "success"
              ? "border-[#b8cf9f] bg-white text-[#4d6a39]"
              : "border-[#d9afa2] bg-[#fff1ec] text-[#8b3e2f]"
          }`}
        >
          {state.status === "success" ? <span aria-hidden="true" className="mr-2">✓</span> : null}
          {state.message}
        </div>
      ) : null}
      <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)_auto] md:items-end">
        <label className="text-sm font-semibold text-ink">
          Name
          <input
            name="name"
            type="text"
            autoComplete="name"
            required
            maxLength={100}
            placeholder="Jamie Smith"
            className="mt-2 min-h-14 w-full rounded-[18px] border border-[#c8d8b7] bg-white px-4 text-base outline-none focus:border-[#739c55]"
          />
        </label>
        <label className="text-sm font-semibold text-ink">
          Email
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="jamie@example.com"
            className="mt-2 min-h-14 w-full rounded-[18px] border border-[#c8d8b7] bg-white px-4 text-base outline-none focus:border-[#739c55]"
          />
        </label>
        <AccountSubmitButton idleLabel="Send invite" pendingLabel="Sending…" fullWidth />
      </div>
    </form>
  );
}
