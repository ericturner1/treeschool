export function funnelStepFormValue(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export function buildAdminFunnelStepSaveInput(
  formData: FormData,
  userId: string
) {
  const id = funnelStepFormValue(formData, "id") || undefined;
  const funnelSlug = funnelStepFormValue(formData, "funnelSlug");
  const routePath = funnelStepFormValue(formData, "routePath");
  const stepName = funnelStepFormValue(formData, "name");
  const stepType = funnelStepFormValue(formData, "stepType");
  const primaryProductId = funnelStepFormValue(formData, "orderPrimaryProductId") || null;
  const oneClickProductId = funnelStepFormValue(formData, "oneClickProductId") || null;
  const generatedSlug = (routePath.split("/").filter(Boolean).at(-1) || stepName)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (stepType === "order_form" && !primaryProductId) {
    throw new Error("Choose a primary product before saving an order form.");
  }
  if (["upsell", "downsell"].includes(stepType) && !oneClickProductId) {
    throw new Error("Choose the product offered on this page.");
  }

  return {
    id,
    funnelSlug,
    routePath,
    input: {
      id,
      funnelId: funnelStepFormValue(formData, "funnelId"),
      userId,
      name: stepName,
      slug: funnelStepFormValue(formData, "slug") || generatedSlug,
      description: funnelStepFormValue(formData, "description"),
      stepType,
      status: funnelStepFormValue(formData, "status"),
      sourceType: funnelStepFormValue(formData, "sourceType"),
      sourceRef: funnelStepFormValue(formData, "sourceRef") || null,
      routePath: routePath || null,
      publicPath: funnelStepFormValue(formData, "publicPath") || null,
      previewPath: funnelStepFormValue(formData, "previewPath") || null,
      linkLabel: funnelStepFormValue(formData, "linkLabel") || null,
      isTopOfFunnel: formData.has("isTopOfFunnel"),
      ...(stepType === "order_form"
        ? {
            settings: {
              journeyNextAction: "button",
              orderForm: {
                primaryProductId,
                orderBumpProductIds: formData
                  .getAll("orderBumpProductId")
                  .map(String)
                  .filter((productId) => Boolean(productId) && productId !== primaryProductId),
                submitLabel:
                  funnelStepFormValue(formData, "orderSubmitLabel") ||
                  "Continue to secure checkout"
              }
            }
          }
        : ["upsell", "downsell"].includes(stepType)
          ? {
              settings: {
                journeyNextAction: "button",
                oneClickOffer: { productId: oneClickProductId }
              }
            }
          : {})
    }
  };
}
