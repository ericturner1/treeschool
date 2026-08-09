import { describe, expect, test } from "bun:test";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { drawPdfText } from "./pdf-text-fonts";

describe("generated PDF text fonts", () => {
  test("draws Japanese lesson-plan titles and labels", async () => {
    const document = await PDFDocument.create();
    const regular = await document.embedFont(StandardFonts.Helvetica);
    const bold = await document.embedFont(StandardFonts.HelveticaBold);
    const page = document.addPage([612, 792]);

    await drawPdfText({
      document,
      page,
      text: "Gajou's learning year - Week 5",
      x: 40,
      y: 740,
      size: 14,
      font: regular,
      color: rgb(0, 0, 0),
    });
    await drawPdfText({
      document,
      page,
      text: "Japanese Language (国語): 国語A",
      x: 40,
      y: 710,
      size: 14,
      font: bold,
      color: rgb(0, 0, 0),
      bold: true,
    });
    await drawPdfText({
      document,
      page,
      text: "第1章・ひらがなを読みましょう",
      x: 40,
      y: 680,
      size: 12,
      font: regular,
      color: rgb(0, 0, 0),
    });

    const bytes = await document.save();
    const saved = await PDFDocument.load(bytes);
    expect(saved.getPageCount()).toBe(1);
    expect(bytes.byteLength).toBeGreaterThan(10_000);
  });
});
