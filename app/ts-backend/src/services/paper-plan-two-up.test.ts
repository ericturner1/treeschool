import { describe, expect, test } from "bun:test";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { imposeTwoUpPdf } from "./paper-plans";

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
});
