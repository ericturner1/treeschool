import QRCode from "qrcode";
import { z } from "zod";

const qrCodeDataSchema = z.string().trim().min(1).max(2_048);
const qrCodeColorSchema = z
  .string()
  .regex(/^#[0-9a-f]{6}$/i, "Use a six-digit QR code color.");

export async function renderWorkbookQrCodeSvg(
  input: string,
  darkColor = "#25201B",
) {
  const data = qrCodeDataSchema.parse(input);
  const color = qrCodeColorSchema.parse(darkColor);
  return QRCode.toString(data, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 1,
    width: 512,
    color: { dark: color, light: "#FFFFFF" },
  });
}

export async function renderWorkbookQrCodeDataUrl(
  input: string,
  darkColor = "#25201B",
) {
  const svg = await renderWorkbookQrCodeSvg(input, darkColor);
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}
