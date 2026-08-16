import { describe, expect, test } from "bun:test";
import {
  normalizedWorkbookSoundType,
  parseWorkbookSoundByteRange,
  validWorkbookSoundAsset,
  workbookSoundAssetObjectPath,
  workbookSoundAssetParts,
  workbookSoundPublicUrl,
} from "./workbook-media";

const projectId = "33333333-3333-4333-8333-333333333333";
const assetId = "22222222-2222-4222-8222-222222222222";

describe("Workbook sound media", () => {
  test("builds immutable storage paths and public URLs", () => {
    const objectPath = workbookSoundAssetObjectPath({
      projectId,
      assetId,
      contentType: "audio/mpeg",
    });
    expect(objectPath).toBe(
      `media-library/workbooks/${projectId}/${assetId}.mp3`,
    );
    expect(workbookSoundAssetParts(objectPath)).toMatchObject({
      projectId,
      assetId,
      extension: "mp3",
    });
    expect(
      workbookSoundPublicUrl(
        { projectId, assetId, contentType: "audio/mpeg" },
        "https://www.treehomeschool.com/",
      ),
    ).toBe(
      `https://www.treehomeschool.com/media/workbooks/${projectId}/${assetId}.mp3`,
    );
  });

  test("normalizes browser audio MIME aliases and validates signatures", () => {
    expect(normalizedWorkbookSoundType("audio/mp3")).toBe("audio/mpeg");
    expect(normalizedWorkbookSoundType("audio/x-m4a")).toBe("audio/mp4");
    expect(normalizedWorkbookSoundType("text/plain")).toBeNull();
    expect(
      validWorkbookSoundAsset(
        new Uint8Array([0x49, 0x44, 0x33, 0x04]),
        "audio/mpeg",
      ),
    ).toBe(true);
    expect(
      validWorkbookSoundAsset(
        new TextEncoder().encode("RIFF0000WAVE"),
        "audio/wav",
      ),
    ).toBe(true);
  });

  test("supports standard and suffix byte ranges", () => {
    expect(parseWorkbookSoundByteRange("bytes=100-199", 1_000)).toEqual({
      start: 100,
      end: 199,
    });
    expect(parseWorkbookSoundByteRange("bytes=900-", 1_000)).toEqual({
      start: 900,
      end: 999,
    });
    expect(parseWorkbookSoundByteRange("bytes=-100", 1_000)).toEqual({
      start: 900,
      end: 999,
    });
    expect(() => parseWorkbookSoundByteRange("bytes=1000-", 1_000)).toThrow(
      RangeError,
    );
  });
});
