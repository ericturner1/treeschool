import type { NormalizedModelUsage } from "../model-usage";

function tokenCount(value: unknown) {
  const count = Number(value);
  return Number.isFinite(count) && count > 0 ? Math.round(count) : 0;
}

export function normalizeGeminiUsage(payload: unknown): NormalizedModelUsage {
  const usage = (
    payload && typeof payload === "object" && "usageMetadata" in payload
      ? (payload as { usageMetadata?: unknown }).usageMetadata
      : null
  );
  const providerUsageJson = usage && typeof usage === "object"
    ? usage as Record<string, unknown>
    : {};
  const inputTokens = tokenCount(providerUsageJson.promptTokenCount);
  const cachedInputTokens = tokenCount(providerUsageJson.cachedContentTokenCount);
  const outputTokens = tokenCount(providerUsageJson.candidatesTokenCount);
  const reasoningTokens = tokenCount(providerUsageJson.thoughtsTokenCount);
  const toolTokens = tokenCount(providerUsageJson.toolUsePromptTokenCount);
  const reportedTotal = tokenCount(providerUsageJson.totalTokenCount);

  return {
    inputTokens,
    cachedInputTokens,
    outputTokens,
    reasoningTokens,
    toolTokens,
    totalTokens: reportedTotal || inputTokens + outputTokens + reasoningTokens + toolTokens,
    providerUsageJson
  };
}
