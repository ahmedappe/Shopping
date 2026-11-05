import type { Metadata } from "next";
import { requireManager } from "@/lib/auth";
import { PrintButton } from "./print-button";

export const metadata: Metadata = { title: "Table QR", robots: { index: false } };

/** Printable QR for one table. The image comes from a public QR service; the link only contains the table's random token. */
export default async function QrPage({ searchParams }: { searchParams: Promise<{ u?: string; t?: string }> }) {
  await requireManager();
  const sp = await searchParams;
  const url = sp.u ?? "";
  let ok = false;
  try {
    const u = new URL(url);
    ok = (u.protocol === "https:" || u.protocol === "http:") && /^\/t\/[a-f0-9]{32}$/.test(u.pathname);
  } catch {}
  if (!ok) return <p className="p-6">Invalid link.</p>;
  const img = `https://api.qrserver.com/v1/create-qr-code/?size=600x600&margin=10&data=${encodeURIComponent(url)}`;
  return (
    <main className="mx-auto max-w-sm p-6 text-center">
      <PrintButton />
      <div className="mt-4 rounded-2xl border-2 border-black p-6">
        <p className="text-sm font-semibold uppercase tracking-widest">Scan for menu</p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={img} alt="QR code" width={300} height={300} className="mx-auto mt-3" />
        <p className="mt-3 text-3xl font-black">Table {sp.t}</p>
        <p className="text-xs">Ring the bell · Call a waiter · Ask for the bill</p>
      </div>
    </main>
  );
}
