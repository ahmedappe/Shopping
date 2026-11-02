import "server-only";
import sharp from "sharp";

const MAX_INPUT_BYTES = 4 * 1024 * 1024; // hard cap on what the server will accept
const ALLOWED_FORMATS = new Set(["jpeg", "png", "webp", "gif", "avif", "heif", "tiff"]);

export type ProcessedImage = { data: Buffer; width: number; height: number; bytes: number };

/**
 * Validates an uploaded image by decoding it (not trusting the file name or MIME type),
 * auto-rotates it, strips all metadata (EXIF/GPS), resizes and re-encodes to WebP.
 */
export async function processImage(
  file: File,
  { maxSize = 1600, quality = 80 }: { maxSize?: number; quality?: number } = {},
): Promise<ProcessedImage> {
  if (!(file instanceof File) || file.size === 0) throw new Error("No file uploaded.");
  if (file.size > MAX_INPUT_BYTES) throw new Error("Image is too large (max 4 MB).");

  const input = Buffer.from(await file.arrayBuffer());
  const image = sharp(input, { failOn: "error", limitInputPixels: 40_000_000, animated: false });

  const meta = await image.metadata().catch(() => null);
  if (!meta?.format || !ALLOWED_FORMATS.has(meta.format)) {
    throw new Error("Unsupported file. Please upload a JPG, PNG or WebP image.");
  }

  const { data, info } = await image
    .rotate()
    .resize({ width: maxSize, height: maxSize, fit: "inside", withoutEnlargement: true })
    .webp({ quality, effort: 4 })
    .toBuffer({ resolveWithObject: true });

  return { data, width: info.width, height: info.height, bytes: info.size };
}
