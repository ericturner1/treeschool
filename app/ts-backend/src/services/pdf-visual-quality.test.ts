import { describe, expect, test } from "bun:test";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { inspectPdfVisualQuality } from "./pdf-visual-quality";

const popplerAvailable =
  Bun.spawnSync(["pdftoppm", "-v"], { stdout: "ignore", stderr: "ignore" })
    .exitCode === 0;

describe("weekly PDF visual quality", () => {
  const popplerTest = popplerAvailable ? test : test.skip;

  popplerTest("renders pages without the PDF.js Path2D canvas bridge", async () => {
    const document = await PDFDocument.create();
    const font = await document.embedFont(StandardFonts.HelveticaBold);
    const contentPage = document.addPage([612, 792]);
    contentPage.drawRectangle({
      x: 48,
      y: 620,
      width: 516,
      height: 80,
      color: rgb(0.45, 0.62, 0.34),
    });
    contentPage.drawText("WEEKLY LESSON PLAN", {
      x: 72,
      y: 652,
      size: 24,
      font,
      color: rgb(1, 1, 1),
    });
    document.addPage([612, 792]);

    const result = await inspectPdfVisualQuality(await document.save());

    expect(result.pageCount).toBe(2);
    expect(result.darkPixelRatios[0]).toBeGreaterThan(0.00075);
    expect(result.darkPixelRatios[1]).toBeLessThan(0.00075);
  }, 60_000);
});
