import { createCanvas, loadImage } from "@napi-rs/canvas";
import { mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const QUALITY_RENDER_MAX_DIMENSION = 220;

async function renderQualityPage(input: {
  sourcePath: string;
  outputPrefix: string;
  pageNumber: number;
}) {
  let renderer: ReturnType<typeof Bun.spawn>;
  try {
    renderer = Bun.spawn(
      [
        "pdftoppm",
        "-png",
        "-singlefile",
        "-scale-to",
        String(QUALITY_RENDER_MAX_DIMENSION),
        "-f",
        String(input.pageNumber),
        "-l",
        String(input.pageNumber),
        input.sourcePath,
        input.outputPrefix,
      ],
      { stdout: "pipe", stderr: "pipe" },
    );
  } catch (error) {
    throw new Error(
      `The weekly PDF quality renderer is unavailable. ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const [exitCode, , stderr] = await Promise.all([
    renderer.exited,
    new Response(renderer.stdout as ReadableStream<Uint8Array>).text(),
    new Response(renderer.stderr as ReadableStream<Uint8Array>).text(),
  ]);
  if (exitCode !== 0) {
    throw new Error(
      `The weekly PDF quality renderer failed on page ${input.pageNumber} (exit ${exitCode}).${stderr.trim() ? ` ${stderr.trim()}` : ""}`,
    );
  }
}

export async function inspectPdfVisualQuality(
  bytes: Uint8Array,
  expectedPageCount: number,
) {
  if (!Number.isInteger(expectedPageCount) || expectedPageCount < 1) {
    throw new Error("The weekly PDF quality renderer needs a valid page count.");
  }
  const workingDirectory = await mkdtemp(
    join(tmpdir(), "treeschool-pdf-quality-"),
  );
  const sourcePath = join(workingDirectory, "packet.pdf");

  try {
    await writeFile(sourcePath, bytes);
    const darkPixelRatios: number[] = [];
    // Poppler can retain every rendered page until the process exits. Render and
    // inspect one page per process so large weekly packets have a bounded memory
    // footprint in the synchronous API request.
    for (let pageNumber = 1; pageNumber <= expectedPageCount; pageNumber += 1) {
      const outputPrefix = join(workingDirectory, `page-${pageNumber}`);
      const outputPath = `${outputPrefix}.png`;
      await renderQualityPage({ sourcePath, outputPrefix, pageNumber });

      const image = await loadImage(await readFile(outputPath));
      const canvas = createCanvas(image.width, image.height);
      const context = canvas.getContext("2d");
      context.fillStyle = "white";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let darkPixels = 0;
      for (let offset = 0; offset < pixels.length; offset += 16) {
        const red = pixels[offset] ?? 255;
        const green = pixels[offset + 1] ?? 255;
        const blue = pixels[offset + 2] ?? 255;
        const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
        if (luminance < 230) darkPixels += 1;
      }
      const sampledPixels = Math.max(1, Math.floor(pixels.length / 16));
      darkPixelRatios.push(Number((darkPixels / sampledPixels).toFixed(6)));
      await unlink(outputPath);
    }

    return {
      pageCount: darkPixelRatios.length,
      darkPixelRatios,
    };
  } finally {
    await rm(workingDirectory, { recursive: true, force: true });
  }
}
