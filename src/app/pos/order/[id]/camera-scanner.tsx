"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

type Detector = { detect(src: HTMLVideoElement): Promise<{ rawValue: string }[]> };
type DetectorCtor = new (opts?: { formats?: string[] }) => Detector;

/** True when this browser can read barcodes from the camera (Chrome/Edge/Android; not iPhone Safari yet). */
export function cameraScanSupported() {
  return typeof window !== "undefined" && "BarcodeDetector" in window;
}

/**
 * Keeps the camera open and calls onCode for every barcode it sees.
 * The same code is ignored for 2 seconds so one item is not added many times.
 */
export function CameraScanner({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const handler = useRef(onCode);
  handler.current = onCode;

  useEffect(() => {
    let stream: MediaStream | null = null;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const last = { code: "", at: 0 };

    async function start() {
      try {
        const Ctor = (window as unknown as { BarcodeDetector: DetectorCtor }).BarcodeDetector;
        const detector = new Ctor({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf", "qr_code"] });
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        if (stopped || !video.current) return;
        video.current.srcObject = stream;
        await video.current.play();
        const tick = async () => {
          if (stopped || !video.current) return;
          try {
            const found = await detector.detect(video.current);
            const code = found[0]?.rawValue;
            if (code && (code !== last.code || Date.now() - last.at > 2000)) {
              last.code = code;
              last.at = Date.now();
              handler.current(code);
            }
          } catch {
            /* a frame that cannot be read is fine */
          }
          timer = setTimeout(tick, 250);
        };
        tick();
      } catch {
        setError("Could not open the camera. Allow camera access for this site, or use a barcode scanner / type the code.");
      }
    }
    start();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black" role="dialog" aria-modal="true">
      <div className="flex items-center justify-between p-3 text-white">
        <p className="font-semibold">Point the camera at a barcode</p>
        <button type="button" aria-label="Close camera" onClick={onClose} className="rounded-lg border border-white/40 p-2"><X className="size-5" /></button>
      </div>
      {error ? <p className="p-4 text-white">{error}</p> : <video ref={video} playsInline muted className="min-h-0 flex-1 object-cover" />}
    </div>
  );
}
