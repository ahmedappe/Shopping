import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireCatalogEditor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { resolvePosOutlet } from "@/lib/pos";
import { variantLabel } from "@/lib/utils";
import { AutoRefresh } from "@/components/pos/auto-refresh";
import { ProductionBoard, type ProductionRow } from "./production-board";

export const metadata: Metadata = { title: "Made in advance", robots: { index: false } };
export const dynamic = "force-dynamic";

type Row = {
  variant_id: string;
  ready_qty: number;
  ready_reorder: number | null;
  variant: { option1: string | null; option2: string | null; product: { name: string } };
};

export default async function ProductionPage({ searchParams }: { searchParams: Promise<{ outlet?: string; station?: string }> }) {
  const user = await requireCatalogEditor();
  const sp = await searchParams;
  const station: "kitchen" | "bar" = sp.station === "bar" ? "bar" : "kitchen";
  const { outlets, outlet } = await resolvePosOutlet(user, sp.outlet, "/kitchen/production");

  if (!outlet) {
    return (
      <main className="mx-auto min-h-dvh max-w-3xl p-6">
        <h1 className="text-2xl font-bold">Which outlet?</h1>
        <ul className="mt-6 grid gap-3 sm:grid-cols-2">
          {outlets.map((o) => (
            <li key={o.id}>
              <Link href={`/kitchen/production?outlet=${o.slug}&station=${station}`} className="card flex min-h-20 items-center p-5 text-lg font-semibold hover:bg-zinc-50">{o.name}</Link>
            </li>
          ))}
        </ul>
      </main>
    );
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("outlet_variants")
    .select("variant_id, ready_qty, ready_reorder, variant:product_variants!inner(option1, option2, product:products!inner(name))")
    .eq("outlet_id", outlet.id)
    .eq("is_active", true)
    .eq("made_in_advance", true)
    .eq("station", station)
    .limit(500);

  const rows: ProductionRow[] = ((data ?? []) as unknown as Row[])
    .map((r) => ({
      variantId: r.variant_id,
      label: [r.variant.product.name, variantLabel(r.variant)].filter(Boolean).join(" · "),
      ready: r.ready_qty,
      reorder: r.ready_reorder,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  return (
    <main className="min-h-dvh bg-zinc-950 p-3 text-white sm:p-5">
      <AutoRefresh seconds={15} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{outlet.name} · made in advance ({station})</h1>
        <Link href={`/kitchen?outlet=${outlet.slug}&station=${station}`} className="inline-flex items-center gap-1 rounded-lg border border-zinc-600 px-3 py-2 text-sm hover:bg-zinc-800">
          <ArrowLeft className="size-4" /> Orders
        </Link>
      </div>
      <ProductionBoard outletId={outlet.id} rows={rows} />
    </main>
  );
}
