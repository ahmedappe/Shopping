"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Loader2, Upload } from "lucide-react";
import { compressImage } from "@/lib/compress-client";
import { uploadPaymentSlip } from "../actions";
import type { ActionResult } from "@/lib/types";

export function SlipUpload({ orderId, hasSlip }: { orderId: string; hasSlip: boolean }) {
  const [state, formAction] = useActionState<ActionResult | null, FormData>(uploadPaymentSlip, null);
  const [isPending, startTransition] = useTransition();
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [compressing, setCompressing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);
  useEffect(() => {
    if (state?.ok) {
      setFile(null);
      setPreview(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }, [state]);

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setLocalError(null);
    const original = e.target.files?.[0];
    if (!original) return;
    setCompressing(true);
    try {
      const compressed = await compressImage(original, 0.6, 1800);
      setFile(compressed);
      setPreview(URL.createObjectURL(compressed));
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Could not read that image.");
      setFile(null);
    } finally {
      setCompressing(false);
    }
  }

  function submit() {
    if (!file) return;
    const fd = new FormData();
    fd.set("orderId", orderId);
    fd.set("slip", file);
    startTransition(() => formAction(fd));
  }

  const busy = compressing || isPending;

  return (
    <div>
      <h3 className="text-sm font-semibold">{hasSlip ? "Replace receipt" : "Upload your transfer receipt"}</h3>
      <p className="mt-1 text-xs text-zinc-500">Screenshot or photo (JPG, PNG, WebP). Images are compressed automatically.</p>

      <label className="mt-3 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-zinc-300 p-6 text-sm text-zinc-600 hover:border-zinc-400">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element -- local blob preview
          <img src={preview} alt="Receipt preview" className="max-h-56 rounded-lg object-contain" />
        ) : (
          <>
            <Upload className="size-6 text-zinc-400" />
            <span>Tap to choose an image</span>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/*"
          className="sr-only"
          onChange={onFileChange}
          disabled={busy}
        />
      </label>

      {(localError || (state && !state.ok)) && (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {localError ?? (state && !state.ok ? state.error : "")}
        </p>
      )}
      {state?.ok && <p className="mt-3 text-sm font-medium text-green-700">{state.message}</p>}

      <button type="button" className="btn-brand mt-4 w-full py-3" disabled={!file || busy} onClick={submit}>
        {busy && <Loader2 className="size-4 animate-spin" />}
        {compressing ? "Compressing…" : isPending ? "Uploading…" : "Submit receipt"}
      </button>
    </div>
  );
}
