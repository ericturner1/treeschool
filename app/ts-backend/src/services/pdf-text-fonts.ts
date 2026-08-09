import { GlobalFonts, createCanvas } from "@napi-rs/canvas";
import { access } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { PDFDocument, PDFFont, PDFPage, RGB } from "pdf-lib";

const NOTO_SANS_JP_REGULAR =
  "@expo-google-fonts/noto-sans-jp/400Regular/NotoSansJP_400Regular.ttf";
const NOTO_SANS_JP_BOLD =
  "@expo-google-fonts/noto-sans-jp/700Bold/NotoSansJP_700Bold.ttf";
const REGULAR_FAMILY = "TreeschoolPacketRegular";
const BOLD_FAMILY = "TreeschoolPacketBold";
const RASTER_SCALE = 3;

let registerFontsPromise: Promise<void> | null = null;

function serviceDirectory() {
  return dirname(fileURLToPath(import.meta.url));
}

function packageFileCandidates(relativePath: string) {
  const serviceDir = serviceDirectory();
  return [
    join(process.cwd(), "node_modules", relativePath),
    join(process.cwd(), "../../node_modules", relativePath),
    join(serviceDir, "../../../node_modules", relativePath),
    join(serviceDir, "../../../../node_modules", relativePath),
  ];
}

async function firstReadablePath(paths: string[]) {
  let lastError: unknown;
  for (const path of paths) {
    try {
      await access(path);
      return path;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(`Could not read ${paths[0]}.`);
}

async function ensureUnicodeFonts() {
  if (!registerFontsPromise) {
    registerFontsPromise = Promise.all([
      firstReadablePath(packageFileCandidates(NOTO_SANS_JP_REGULAR)),
      firstReadablePath(packageFileCandidates(NOTO_SANS_JP_BOLD)),
    ]).then(([regularPath, boldPath]) => {
      if (!GlobalFonts.registerFromPath(regularPath, REGULAR_FAMILY)) {
        throw new Error("Could not register the regular weekly-PDF Unicode font.");
      }
      if (!GlobalFonts.registerFromPath(boldPath, BOLD_FAMILY)) {
        throw new Error("Could not register the bold weekly-PDF Unicode font.");
      }
    });
  }
  return registerFontsPromise;
}

function standardFontCanEncode(font: PDFFont, text: string) {
  try {
    font.encodeText(text);
    return true;
  } catch {
    return false;
  }
}

function canvasFont(size: number, bold: boolean, scale = 1) {
  return `${size * scale}px ${bold ? BOLD_FAMILY : REGULAR_FAMILY}`;
}

function unicodeTextWidth(text: string, size: number, bold: boolean) {
  const canvas = createCanvas(1, 1);
  const context = canvas.getContext("2d");
  context.font = canvasFont(size, bold);
  return context.measureText(text).width;
}

function fitUnicodeText(
  text: string,
  size: number,
  bold: boolean,
  maxWidth: number | undefined,
) {
  if (!maxWidth || unicodeTextWidth(text, size, bold) <= maxWidth) return text;
  const suffix = "...";
  const characters = Array.from(text);
  while (
    characters.length > 1 &&
    unicodeTextWidth(`${characters.join("")}${suffix}`, size, bold) > maxWidth
  ) {
    characters.pop();
  }
  return `${characters.join("").trimEnd()}${suffix}`;
}

function cssColor(color: RGB) {
  const component = (value: number) => Math.round(Math.max(0, Math.min(1, value)) * 255);
  return `rgb(${component(color.red)}, ${component(color.green)}, ${component(color.blue)})`;
}

/**
 * Draws generated packet text with the normal compact PDF font when possible.
 * For Unicode strings, it rasterizes only that line with the pinned Noto Sans
 * JP font. PDF's built-in Helvetica throws on Japanese, while pdf-lib's custom
 * TrueType embedding corrupts CJK glyph positioning in common PDF readers.
 */
export async function drawPdfText(input: {
  document: PDFDocument;
  page: PDFPage;
  text: string;
  x: number;
  y: number;
  size: number;
  font: PDFFont;
  color: RGB;
  bold?: boolean;
  maxWidth?: number;
}) {
  if (standardFontCanEncode(input.font, input.text)) {
    let text = input.text;
    if (input.maxWidth && input.font.widthOfTextAtSize(text, input.size) > input.maxWidth) {
      const suffix = "...";
      while (
        text.length > 1 &&
        input.font.widthOfTextAtSize(`${text}${suffix}`, input.size) > input.maxWidth
      ) {
        text = text.slice(0, -1).trimEnd();
      }
      text = `${text}${suffix}`;
    }
    input.page.drawText(text, {
      x: input.x,
      y: input.y,
      size: input.size,
      font: input.font,
      color: input.color,
    });
    return;
  }

  await ensureUnicodeFonts();
  const text = fitUnicodeText(input.text, input.size, Boolean(input.bold), input.maxWidth);
  const padding = 2 * RASTER_SCALE;
  const baseline = padding + input.size * RASTER_SCALE;
  const textWidth = unicodeTextWidth(text, input.size, Boolean(input.bold));
  const width = Math.max(1, Math.ceil(textWidth * RASTER_SCALE + padding * 2));
  const height = Math.max(1, Math.ceil(input.size * 1.45 * RASTER_SCALE + padding * 2));
  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d");
  context.font = canvasFont(input.size, Boolean(input.bold), RASTER_SCALE);
  context.fillStyle = cssColor(input.color);
  context.textBaseline = "alphabetic";
  context.fillText(text, padding, baseline);
  const image = await input.document.embedPng(canvas.toBuffer("image/png"));
  input.page.drawImage(image, {
    x: input.x - padding / RASTER_SCALE,
    y: input.y - (height - baseline) / RASTER_SCALE,
    width: width / RASTER_SCALE,
    height: height / RASTER_SCALE,
  });
}
