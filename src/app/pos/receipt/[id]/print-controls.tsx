"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Printer } from "lucide-react";

/**
 * Opens the print dialog once when arriving from a payment. With the browser started in kiosk-printing mode
 * (chrome --kiosk-printing) and the receipt printer set as the default, it prints with no dialog at all.
 */
export function PrintControls({ auto, back }: { auto: boolean; back: string }) {
  useEffect(() => {
    if (!auto) return;
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, [auto]);
  return (
    <>
      <style>{`@page { size: 80mm auto; margin: 4mm; } @media print { body { background: #fff !important; } }`}</style>
      <div className="mb-4 flex gap-2 print:hidden">
        <button type="button" className="btn-primary flex-1" onClick={() => window.print()}><Printer className="size-4" /> Print</button>
        <Link href={back} className="btn-outline flex-1 justify-center">Done</Link>
      </div>
    </>
  );
}
