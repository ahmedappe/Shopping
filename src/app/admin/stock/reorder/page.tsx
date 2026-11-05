import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireCatalogEditor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getAdminOutlets, pickOutlet } from "@/lib/admin-outlets";
import { variantLabel } from "@/lib/utils";
import { ReorderList, type ReorderGroup } from "./reorder-list";

export const metadata: Metadata = { title: "Reorder list" };

type Row = {
  outlet_id: string;
  variant_id: string;
  product_id: string;
  product_name: string;
  option1: string | null;
  option2: string | null;
  unit: string;
  stock: number;
  godown_stock: number;
  reorder_level: number;
  order_qty: number;
  shelf_location: string | null;
  supplier_id: string | null;
  supplier_name: string | null;
  supplier_phone: string | null;
  supplier_code: string | null;
};

export default async function ReorderPage({ searchParams }: { searchParams: Promise<{ outlet?: string }> }) {
  const user = await requireCatalogEditor();
  const params = await searchParams;
  const outlets = await getAdminOutlets(user);
  const { selected, ids } = pickOutlet(outlets, params.outlet);
  const outletName = new Map(outlets.map((o) => [o.id, o.name]));

  const supabase = await createClient();
  const { data } = ids.length
    ? await supabase.from("reorder_suggestions").select("*").in("outlet_id", ids).order("product_name").limit(3000)
    : { data: [] };
  const rows = (data ?? []) as Row[];

  // One group per supplier; items without a supplier go last.
  const groups = new Map<string, ReorderGroup>();
  for (const r of rows) {
    const key = r.supplier_id ?? "none";
    let g = groups.get(key);
    if (!g) {
      g = { key, supplierName: r.supplier_name ?? "No supplier set", supplierPhone: r.supplier_phone, lines: [] };
      groups.set(key, g);
    }
    g.lines.push({
      id: `${r.outlet_id}:${r.variant_id}`,
      productId: r.product_id,
      outletName: outletName.get(r.outlet_id) ?? "",
      item: `${r.product_name}${variantLabel(r) ? ` ${variantLabel(r)}` : ""}`,
      code: r.supplier_code,
      unit: r.unit,
      have: r.stock + r.godown_stock,
      reorderLevel: r.reorder_level,
      qty: r.order_qty,
      shelf: r.shelf_location,
    });
  }
  const list = [...groups.values()].sort((a, b) => (a.key === "none" ? 1 : b.key === "none" ? -1 : a.supplierName.localeCompare(b.supplierName)));

  return (
    <div className="max-w-5xl">
      <Link href="/admin/stock" className="inline-flex items-center gap-1.5 text-sm text-zinc-600 hover:text-zinc-900">
        <ArrowLeft className="size-4" /> Stock
      </Link>
      <h1 className="mt-4 text-2xl font-bold tracking-tight">Reorder list</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Items at or below their reorder level (shop + godown), grouped by main supplier. Change quantities, then press Copy message and paste it into WhatsApp, Viber or SMS.
        Set reorder levels and suppliers on each product page.
      </p>

      {outlets.length > 1 && (
        <form className="mt-4 flex items-center gap-2">
          <select name="outlet" defaultValue={selected?.slug ?? ""} className="input max-w-xs">
            <option value="">All my outlets</option>
            {outlets.map((o) => (
              <option key={o.id} value={o.slug}>{o.name}</option>
            ))}
          </select>
          <button className="btn-outline" type="submit">Show</button>
        </form>
      )}

      <ReorderList groups={list} deliverTo={selected?.name ?? null} />
    </div>
  );
}
