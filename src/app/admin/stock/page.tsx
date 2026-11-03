import type { Metadata } from "next";
import Link from "next/link";
import { requireCatalogEditor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getAdminOutlets } from "@/lib/admin-outlets";
import { sanitizeSearch, variantLabel } from "@/lib/utils";
import { STORE } from "@/config/store";

export const metadata: Metadata = { title: "Stock" };

type Row = {
  outlet_id: string;
  stock: number;
  godown_stock: number;
  is_active: boolean;
  variant: {
    id: string;
    option1: string | null;
    option2: string | null;
    product: { id: string; name: string } | null;
  } | null;
};

export default async function AdminStockPage({ searchParams }: { searchParams: Promise<{ q?: string; low?: string }> }) {
  const user = await requireCatalogEditor();
  const params = await searchParams;
  const q = sanitizeSearch(params.q ?? "");
  const lowOnly = params.low === "1";
  const outlets = await getAdminOutlets(user);

  const supabase = await createClient();
  const { data } = outlets.length
    ? await supabase
        .from("outlet_variants")
        .select("outlet_id, stock, godown_stock, is_active, variant:product_variants!inner(id, option1, option2, product:products!inner(id, name))")
        .in("outlet_id", outlets.map((o) => o.id))
        .limit(5000)
    : { data: [] };

  // One line per variant, one column per outlet.
  const lines = new Map<string, { productId: string; name: string; label: string; stock: Map<string, { shop: number; godown: number }>; total: number }>();
  for (const r of (data ?? []) as unknown as Row[]) {
    // Godown stock counts even where the item is not for sale (a transfer can arrive before it is switched on).
    if (!r.variant?.product) continue;
    if (!r.is_active && r.stock === 0 && r.godown_stock === 0) continue;
    const key = r.variant.id;
    let line = lines.get(key);
    if (!line) {
      line = { productId: r.variant.product.id, name: r.variant.product.name, label: variantLabel(r.variant), stock: new Map(), total: 0 };
      lines.set(key, line);
    }
    line.stock.set(r.outlet_id, { shop: r.stock, godown: r.godown_stock });
    line.total += r.stock + r.godown_stock;
  }

  let list = [...lines.values()].sort((a, b) => a.name.localeCompare(b.name) || a.label.localeCompare(b.label));
  if (q) list = list.filter((l) => `${l.name} ${l.label}`.toLowerCase().includes(q.toLowerCase()));
  if (lowOnly) list = list.filter((l) => [...l.stock.values()].some((s) => s.shop <= STORE.lowStockThreshold));

  const cell = (n: { shop: number; godown: number } | undefined) =>
    n === undefined ? (
      <span className="text-zinc-300">–</span>
    ) : (
      <>
        <span className={n.shop === 0 ? "font-semibold text-red-600" : n.shop <= STORE.lowStockThreshold ? "text-amber-600" : ""}>{n.shop}</span>
        <span className="text-zinc-400"> / {n.godown}</span>
      </>
    );

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Stock</h1>
        <Link href="/admin/stock/transfers" className="btn-primary">Stock transfers</Link>
      </div>
      <p className="mt-1 text-sm text-zinc-500">
        Each outlet shows shop stock / godown stock, then the company total (shop + godown){user.isAdmin ? "" : " across your outlets"}. Change a count from the product page.
      </p>

      <form className="mt-6 flex max-w-xl flex-wrap items-center gap-3">
        <input name="q" type="search" defaultValue={q} placeholder="Search products" className="input flex-1" />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="low" value="1" defaultChecked={lowOnly} /> Low stock only
        </label>
        <button className="btn-outline" type="submit">Filter</button>
      </form>

      <div className="card mt-4 overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs font-medium text-zinc-500 uppercase">
            <tr>
              <th className="px-4 py-3">Item</th>
              {outlets.map((o) => (
                <th key={o.id} className="px-3 py-3 text-right">{o.name}</th>
              ))}
              <th className="px-4 py-3 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {list.map((l) => (
              <tr key={`${l.productId}-${l.label}`} className="hover:bg-zinc-50">
                <td className="px-4 py-2.5">
                  <Link href={`/admin/products/${l.productId}`} className="font-medium hover:underline">{l.name}</Link>
                  {l.label && <span className="text-zinc-500"> · {l.label}</span>}
                </td>
                {outlets.map((o) => (
                  <td key={o.id} className="px-3 py-2.5 text-right">{cell(l.stock.get(o.id))}</td>
                ))}
                <td className="px-4 py-2.5 text-right font-semibold">{l.total}</td>
              </tr>
            ))}
            {list.length === 0 && (
              <tr>
                <td colSpan={outlets.length + 2} className="px-4 py-10 text-center text-zinc-500">
                  Nothing to show.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
