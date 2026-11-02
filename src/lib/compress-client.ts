"use client";

import imageCompression from "browser-image-compression";

/**
 * Compresses an image in the browser before upload (saves bandwidth and keeps
 * requests under the server limit). The server re-encodes it again with sharp.
 */
export async function compressImage(file: File, maxSizeMB = 0.8, maxWidthOrHeight = 1600): Promise<File> {
  if (!file.type.startsWith("image/")) throw new Error("Please choose an image file.");
  if (file.size > 20 * 1024 * 1024) throw new Error("Image is too large (max 20 MB).");

  const compressed = await imageCompression(file, {
    maxSizeMB,
    maxWidthOrHeight,
    useWebWorker: true,
    fileType: "image/webp",
    initialQuality: 0.8,
  });

  const name = file.name.replace(/\.[^.]+$/, "") + ".webp";
  return new File([compressed], name, { type: "image/webp" });
}
