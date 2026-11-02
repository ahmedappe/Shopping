"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, ImagePlus, Loader2, Trash2 } from "lucide-react";
import { compressImage } from "@/lib/compress-client";
import { deleteProductImage, reorderProductImages, uploadProductImage } from "./actions";

export function ImageManager({ productId, images }: { productId: string; images: { id: string; url: string }[] }) {
  const router = useRouter();
  const [uploading, setUploading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    const list = Array.from(files).slice(0, Math.max(0, 12 - images.length));
    for (const [i, file] of list.entries()) {
      setUploading(`Uploading ${i + 1} of ${list.length}…`);
      try {
        const compressed = await compressImage(file, 0.8, 1600);
        const fd = new FormData();
        fd.set("productId", productId);
        fd.set("file", compressed);
        const res = await uploadProductImage(fd);
        if (!res.ok) {
          setError(`${file.name}: ${res.error}`);
          break;
        }
      } catch (e) {
        setError(`${file.name}: ${e instanceof Error ? e.message : "upload failed"}`);
        break;
      }
    }
    setUploading(null);
    router.refresh();
  }

  function move(index: number, dir: -1 | 1) {
    const ids = images.map((i) => i.id);
    const target = index + dir;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    startTransition(async () => {
      await reorderProductImages(productId, ids);
      router.refresh();
    });
  }

  function remove(id: string) {
    if (!window.confirm("Delete this image?")) return;
    startTransition(async () => {
      const res = await deleteProductImage(id);
      if (!res.ok) setError(res.error);
      router.refresh();
    });
  }

  return (
    <div className="mt-4">
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
        {images.map((img, i) => (
          <div key={img.id} className="group relative aspect-square overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100">
            <Image src={img.url} alt="" fill sizes="150px" className="object-cover" />
            {i === 0 && (
              <span className="absolute top-1 left-1 rounded bg-zinc-900/80 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                Main
              </span>
            )}
            <div className="absolute inset-x-0 bottom-0 flex justify-between bg-black/50 p-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
              <button type="button" className="rounded p-1 text-white hover:bg-white/20 disabled:opacity-30" disabled={i === 0 || isPending} onClick={() => move(i, -1)} aria-label="Move left">
                <ChevronLeft className="size-4" />
              </button>
              <button type="button" className="rounded p-1 text-white hover:bg-red-500" disabled={isPending} onClick={() => remove(img.id)} aria-label="Delete image">
                <Trash2 className="size-4" />
              </button>
              <button
                type="button"
                className="rounded p-1 text-white hover:bg-white/20 disabled:opacity-30"
                disabled={i === images.length - 1 || isPending}
                onClick={() => move(i, 1)}
                aria-label="Move right"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>
          </div>
        ))}

        {images.length < 12 && (
          <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-zinc-300 text-xs text-zinc-500 hover:border-zinc-400">
            {uploading ? <Loader2 className="size-5 animate-spin" /> : <ImagePlus className="size-5" />}
            <span className="px-2 text-center">{uploading ?? "Add images"}</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="sr-only"
              disabled={Boolean(uploading)}
              onChange={(e) => {
                void onFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
        )}
      </div>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </div>
  );
}
