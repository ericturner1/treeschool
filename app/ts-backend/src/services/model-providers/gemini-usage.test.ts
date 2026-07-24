import { describe, expect, test } from "bun:test";
import { normalizeGeminiUsage } from "./gemini-usage";

describe("normalizeGeminiUsage", () => {
  test("maps Gemini usage metadata into vendor-neutral token fields", () => {
    const usage = normalizeGeminiUsage({
      usageMetadata: {
        promptTokenCount: 1200,
        cachedContentTokenCount: 300,
        candidatesTokenCount: 400,
        thoughtsTokenCount: 125,
        toolUsePromptTokenCount: 25,
        totalTokenCount: 1750,
        promptTokensDetails: [{ modality: "DOCUMENT", tokenCount: 900 }]
      }
    });

    expect(usage).toEqual({
      inputTokens: 1200,
      cachedInputTokens: 300,
      outputTokens: 400,
      reasoningTokens: 125,
      toolTokens: 25,
      totalTokens: 1750,
      providerUsageJson: {
        promptTokenCount: 1200,
        cachedContentTokenCount: 300,
        candidatesTokenCount: 400,
        thoughtsTokenCount: 125,
        toolUsePromptTokenCount: 25,
        totalTokenCount: 1750,
        promptTokensDetails: [{ modality: "DOCUMENT", tokenCount: 900 }]
      }
    });
  });

  test("returns zeros when a provider response has no usage metadata", () => {
    expect(normalizeGeminiUsage({ candidates: [] })).toEqual({
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      reasoningTokens: 0,
      toolTokens: 0,
      totalTokens: 0,
      providerUsageJson: {}
    });
  });
});
