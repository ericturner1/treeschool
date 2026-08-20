import { describe, expect, test } from "bun:test";
import { PDFDocument, StandardFonts } from "pdf-lib";
import {
  appendPdfPageRange,
  imposeTwoUpPdf,
  pdfPageSizeMatchesTarget
} from "./paper-plans";

describe("two-up lesson-plan PDFs", () => {
  test("places two portrait pages on each landscape page without dropping an odd final page", async () => {
    const source = await PDFDocument.create();
    const font = await source.embedFont(StandardFonts.Helvetica);
    for (let pageNumber = 1; pageNumber <= 3; pageNumber += 1) {
      const page = source.addPage([612, 792]);
      page.drawText(`Source page ${pageNumber}`, {
        x: 40,
        y: 740,
        size: 24,
        font
      });
    }

    const compactBytes = await imposeTwoUpPdf(await source.save());
    const compact = await PDFDocument.load(compactBytes);

    expect(compact.getPageCount()).toBe(2);
    for (const page of compact.getPages()) {
      const { width, height } = page.getSize();
      expect(width).toBe(792);
      expect(height).toBe(612);
      expect(width).toBeGreaterThan(height);
    }
  });

  test("keeps daily-summary QR pages valid while enlarging them for compact printing", async () => {
    const source = await PDFDocument.create();
    const font = await source.embedFont(StandardFonts.Helvetica);
    for (const label of ["Daily summary", "Workbook page"]) {
      const page = source.addPage([595, 842]);
      page.drawText(label, { x: 40, y: 780, size: 20, font });
    }

    const compactBytes = await imposeTwoUpPdf(await source.save(), [{
      pageIndex: 0,
      weeklyPlanId: "11111111-1111-4111-8111-111111111111",
      dayNumber: 1
    }]);
    const compact = await PDFDocument.load(compactBytes);

    expect(compact.getPageCount()).toBe(1);
    expect(compact.getPage(0).getWidth()).toBe(842);
    expect(compact.getPage(0).getHeight()).toBe(595);
  });

  test("omits pages annotated as full-size before pairing the compact pages", async () => {
    const source = await PDFDocument.create();
    const font = await source.embedFont(StandardFonts.Helvetica);
    for (let pageNumber = 1; pageNumber <= 5; pageNumber += 1) {
      const page = source.addPage([612, 792]);
      page.drawText(`Source page ${pageNumber}`, { x: 40, y: 740, size: 24, font });
    }

    const compactBytes = await imposeTwoUpPdf(await source.save(), [], [1, 3]);
    const compact = await PDFDocument.load(compactBytes);

    expect(compact.getPageCount()).toBe(2);
  });
});

describe("workbook page preservation", () => {
  test("recognizes near-identical A4 dimensions", () => {
    expect(pdfPageSizeMatchesTarget(
      { width: 595.276, height: 841.89 },
      [595.28, 841.89]
    )).toBe(true);
    expect(pdfPageSizeMatchesTarget(
      { width: 612, height: 792 },
      [595.28, 841.89]
    )).toBe(false);
  });

  test("copies a same-size source page directly instead of fitting it into a form", async () => {
    const source = await PDFDocument.create();
    source.addPage([595, 842]);
    const packet = await PDFDocument.create();

    await appendPdfPageRange(packet, await source.save(), 0, 0, [595.28, 841.89]);

    const output = await PDFDocument.load(await packet.save());
    expect(output.getPageCount()).toBe(1);
    expect(output.getPage(0).getWidth()).toBe(595);
    expect(output.getPage(0).getHeight()).toBe(842);
  });
});
