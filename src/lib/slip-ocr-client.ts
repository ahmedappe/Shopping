"use client";

/**
 * Reads the text on a receipt image, in the customer's browser.
 *
 * Runs Tesseract (WebAssembly) so nothing extra is needed on the server. The
 * library and English language data (~10 MB) are loaded on first use only, then
 * cached by the browser. If anything goes wrong we return `ok: false` and the
 * upload carries on unchecked — a broken OCR must never stop a real customer
 * from paying.
 */

const OCR_TIMEOUT_MS = 45_000;

export type OcrOutcome = { ok: true; text: string } | { ok: false; reason: string };

/** Upscale small images, convert to grayscale and flip light-on-dark screens (dark-mode banking apps). */
async function prepare(file: File): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file);
  const targetWidth = Math.min(2000, Math.max(1400, bitmap.width));
  const scale = targetWidth / bitmap.width;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();

  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  let sum = 0;
  for (let i = 0; i < d.length; i += 4) {
    const g = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
    d[i] = d[i + 1] = d[i + 2] = g;
    sum += g;
  }
  const dark = sum / (d.length / 4) < 110;
  if (dark) {
    for (let i = 0; i < d.length; i += 4) {
      const v = 255 - d[i];
      d[i] = d[i + 1] = d[i + 2] = v;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

export async function readReceiptText(file: File): Promise<OcrOutcome> {
  let worker: Awaited<ReturnType<typeof import("tesseract.js").createWorker>> | null = null;
  try {
    const canvas = await prepare(file);
    const { createWorker } = await import("tesseract.js");
    worker = await createWorker("eng");

    const result = await Promise.race([
      worker.recognize(canvas),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("OCR timed out")), OCR_TIMEOUT_MS)),
    ]);
    return { ok: true, text: result.data.text ?? "" };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : "OCR failed" };
  } finally {
    try {
      await worker?.terminate();
    } catch {
      /* ignore */
    }
  }
}
