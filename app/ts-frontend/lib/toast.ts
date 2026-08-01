export const GLOBAL_TOAST_EVENT = "treeschool:toast";

export type GlobalToastDetail = {
  kind?: "success" | "error";
  text: string;
};

export function showGlobalToast(detail: GlobalToastDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<GlobalToastDetail>(GLOBAL_TOAST_EVENT, { detail }));
}
