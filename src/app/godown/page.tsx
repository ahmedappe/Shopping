import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Warehouse } from "lucide-react";
import { requireCatalogEditor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getAdminOutlets } from "@/lib/admin-outlets";
import { variantLabel } from "@/lib/utils";
import { TransferBuilder, type BuilderItem } from "@/components/admin/transfer-builder";

export const metadata: Metadata = { title: "Godown", robots: { index: false } };

type StockRow = {
  variant_id: string;
  stock: number;
  godown_stock: number;
  shelf_location: string | null;
  variant: {
    option1: string | null;
    option2: string | null;
    sku: string | null;
    barcode: string | null;
    product: { name: string; unit: string | null } | null;
  } | null;
};

/**
 * Godown tablet: a simple full-screen page for a tablet kept at the godown.
 * Search an item, enter the quantity, add more, confirm once.
 */
export default async function GodownTabletPage({ searchParams }: { searchParams: Promise<{ outlet?: string }> }) {
  const user = await requireCatalogEditor();
  const params = await searchParams;
  const outlets = await getAdminOutlets(user);
  const outlet = outlets.find((o) => o.slug === params.outlet) ?? (outlets.length === 1 ? outlets[0] : null);

  if (!outlet) {
    return (
      <main className="mx-auto min-h-dvh max-w-3xl p-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold"><Warehouse className="size-6" /> Which godown is this tablet at?</h1>
        <p className="mt-1 text-sm text-zinc-500">Bookmark the page after choosing, so the tablet opens straight to it.</p>
        <ul className="mt-6 grid gap-3 sm:grid-cols-2">
          {outlets.map((o) => (
            <li key={o.id}>
              <Link href={`/godown?outlet=${o.slug}`} className="card flex min-h-20 items-center p-5 text-lg font-semibold hover:bg-zinc-50">
                {o.name} godown
              </Link>
            </li>
          ))}
          {outlets.length === 0 && <li className="text-zinc-500">You are not assigned to any outlet yet. Ask an admin for outlet access.</li>}
        </ul>
      </main>
    );
  }

  const supabase = await createClient();
  const [{ data: destRows }, { data: stockRows }] = await Promise.all([
    outlet.company_id
      ? supabase.from("outlets").select("id, name").eq("company_id", outlet.company_id).eq("is_active", true).order("sort_order")
      : Promise.resolve({ data: [{ id: outlet.id, name: outlet.name }] }),
    supabase
      .from("outlet_variants")
      .select("variant_id, stock, godown_stock, shelf_location, variant:product_variants!inner(option1, option2, sku, barcode, product:products!inner(name, unit))")
      .eq("outlet_id", outlet.id)
      .limit(5000),
  ]);
  const rows = (stockRows ?? []) as unknown as StockRow[];
  const items: BuilderItem[] = rows
    .filter((r) => r.variant?.product)
    .map((r) => ({
      id: r.variant_id,
      label: `${r.variant!.product!.name}${variantLabel(r.variant!) ? ` · ${variantLabel(r.variant!)}` : ""}`,
      sku: r.variant!.sku,
      barcode: r.variant!.barcode,
      unit: r.variant!.product!.unit ?? "pcs",
      shelf: r.shelf_location,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const stock = Object.fromEntries(rows.map((r) => [`${outlet.id}:${r.variant_id}`, { shop: r.stock, godown: r.godown_stock }]));

  return (
    <main className="mx-auto min-h-dvh max-w-4xl p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-bold"><Warehouse className="size-6" /> {outlet.name} godown</h1>
        <div className="flex items-center gap-3 text-sm text-zinc-500">
          <span>{user.fullName ?? user.email}</span>
          {outlets.length > 1 && (
            <Link href="/godown" className="btn-outline">Change godown</Link>
          )}
          <Link href="/admin/stock" className="btn-ghost"><ArrowLeft className="size-4" /> Admin</Link>
        </div>
      </div>
      <p className="mt-1 text-sm text-zinc-500">Search an item, enter how many, add more, then confirm. A manager approves before stock moves.</p>
      <section className="card mt-4 p-4 sm:p-6">
        <TransferBuilder
          large
          outlets={(destRows ?? []) as { id: string; name: string }[]}
          items={items}
          stock={stock}
          checkStockFor={[outlet.id]}
          fixedFrom={{ outletId: outlet.id, location: "godown" }}
          defaultTo={{ outletId: outlet.id, location: "shop" }}
        />
      </section>
    </main>
  );
}
