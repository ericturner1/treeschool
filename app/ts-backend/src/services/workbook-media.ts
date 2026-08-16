const WORKBOOK_SOUND_CONTENT_TYPES = [
  "audio/mpeg",
  "audio/mp4",
  "audio/wav",
  "audio/ogg",
] as const;

export type WorkbookSoundContentType =
  (typeof WORKBOOK_SOUND_CONTENT_TYPES)[number];

export const WORKBOOK_SOUND_ASSET_MAX_BYTES = 30 * 1024 * 1024;

export const WORKBOOK_SOUND_ASSET_TYPES = new Map<
  WorkbookSoundContentType,
  string
>([
  ["audio/mpeg", "mp3"],
  ["audio/mp4", "m4a"],
  ["audio/wav", "wav"],
  ["audio/ogg", "ogg"],
]);

export function normalizedWorkbookSoundType(
  contentType: string | null | undefined,
): WorkbookSoundContentType | null {
  const normalized = String(contentType ?? "")
    .split(";", 1)[0]!
    .trim()
    .toLowerCase();
  if (normalized === "audio/mp3") return "audio/mpeg";
  if (normalized === "audio/x-m4a") return "audio/mp4";
  if (normalized === "audio/x-wav" || normalized === "audio/wave") {
    return "audio/wav";
  }
  return WORKBOOK_SOUND_CONTENT_TYPES.includes(
    normalized as WorkbookSoundContentType,
  )
    ? (normalized as WorkbookSoundContentType)
    : null;
}

export function workbookSoundAssetObjectPath(input: {
  projectId: string;
  assetId: string;
  contentType: WorkbookSoundContentType;
}) {
  const extension = WORKBOOK_SOUND_ASSET_TYPES.get(input.contentType);
  if (!extension) throw new Error("The workbook sound type is not supported.");
  return `media-library/workbooks/${input.projectId}/${input.assetId}.${extension}`;
}

export function workbookSoundAssetParts(objectPath: string) {
  const match = objectPath.match(
    /^media-library\/workbooks\/([0-9a-f-]{36})\/([0-9a-f-]{36})\.(mp3|m4a|wav|ogg)$/i,
  );
  if (!match) throw new Error("The workbook sound upload is invalid.");
  return {
    projectId: match[1]!,
    assetId: match[2]!,
    filename: `${match[2]!}.${match[3]!.toLowerCase()}`,
    extension: match[3]!.toLowerCase(),
  };
}

export function workbookSoundPublicPath(input: {
  projectId: string;
  assetId: string;
  contentType: WorkbookSoundContentType;
}) {
  const objectPath = workbookSoundAssetObjectPath(input);
  const { filename } = workbookSoundAssetParts(objectPath);
  return `/media/workbooks/${input.projectId}/${filename}`;
}

export function workbookSoundPublicUrl(
  input: {
    projectId: string;
    assetId: string;
    contentType: WorkbookSoundContentType;
  },
  publicAppUrl: string,
) {
  return `${publicAppUrl.replace(/\/$/, "")}${workbookSoundPublicPath(input)}`;
}

export function validWorkbookSoundAsset(
  bytes: Uint8Array,
  contentType: WorkbookSoundContentType,
) {
  if (contentType === "audio/mpeg") {
    return (
      (bytes.length >= 3 &&
        String.fromCharCode(...bytes.slice(0, 3)) === "ID3") ||
      (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0)
    );
  }
  if (contentType === "audio/mp4") {
    return (
      bytes.length >= 12 &&
      String.fromCharCode(...bytes.slice(4, 8)) === "ftyp"
    );
  }
  if (contentType === "audio/wav") {
    return (
      bytes.length >= 12 &&
      String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.slice(8, 12)) === "WAVE"
    );
  }
  return (
    contentType === "audio/ogg" &&
    bytes.length >= 4 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "OggS"
  );
}

export function parseWorkbookSoundByteRange(
  rangeHeader: string | null | undefined,
  totalSize: number,
) {
  if (!rangeHeader) return null;
  const match = rangeHeader.trim().match(/^bytes=(\d*)-(\d*)$/i);
  if (!match || (!match[1] && !match[2])) {
    throw new RangeError("The requested audio range is invalid.");
  }

  let start: number;
  let end: number;
  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) {
      throw new RangeError("The requested audio range is invalid.");
    }
    start = Math.max(totalSize - suffixLength, 0);
    end = totalSize - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : totalSize - 1;
  }

  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    start >= totalSize ||
    end < start
  ) {
    throw new RangeError("The requested audio range is invalid.");
  }
  return { start, end: Math.min(end, totalSize - 1) };
}
