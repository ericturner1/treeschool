import { createCanvas, loadImage } from "@napi-rs/canvas";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const QUALITY_RENDER_MAX_DIMENSION = 220;

export async function inspectPdfVisualQuality(bytes: Uint8Array) {
  const workingDirectory = await mkdtemp(
    join(tmpdir(), "treeschool-pdf-quality-"),
  );
  const sourcePath = join(workingDirectory, "packet.pdf");
  const outputPrefix = join(workingDirectory, "page");

  try {
    await writeFile(sourcePath, bytes);
    let renderer: ReturnType<typeof Bun.spawn>;
    try {
      renderer = Bun.spawn(
        [
          "pdftoppm",
          "-png",
          "-scale-to",
          String(QUALITY_RENDER_MAX_DIMENSION),
          sourcePath,
          outputPrefix,
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
        `The weekly PDF quality renderer failed (exit ${exitCode}).${stderr.trim() ? ` ${stderr.trim()}` : ""}`,
      );
    }

    const renderedPages = (await readdir(workingDirectory))
      .map((filename) => ({
        filename,
        pageNumber: Number(
          filename.match(/^page-(\d+)\.png$/)?.[1] ?? Number.NaN,
        ),
      }))
      .filter(({ pageNumber }) => Number.isInteger(pageNumber))
      .sort((left, right) => left.pageNumber - right.pageNumber);
    if (!renderedPages.length || renderedPages[0]?.pageNumber !== 1) {
      throw new Error("The weekly PDF quality renderer returned no first page.");
    }
    for (let index = 0; index < renderedPages.length; index += 1) {
      if (renderedPages[index]?.pageNumber !== index + 1) {
        throw new Error(
          "The weekly PDF quality renderer returned an incomplete page sequence.",
        );
      }
    }

    const darkPixelRatios: number[] = [];
    for (const renderedPage of renderedPages) {
      const image = await loadImage(
        await readFile(join(workingDirectory, renderedPage.filename)),
      );
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
    }

    return {
      pageCount: renderedPages.length,
      darkPixelRatios,
    };
  } finally {
    await rm(workingDirectory, { recursive: true, force: true });
  }
}
