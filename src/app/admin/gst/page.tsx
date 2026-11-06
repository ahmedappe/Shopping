import type { Metadata } from "next";
import { requireCatalogEditor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getAdminOutlets } from "@/lib/admin-outlets";
import { OutletFilter } from "@/components/admin/outlet-filter";
import { sanitizeSearch } from "@/lib/utils";
import { GstPanels, type CatRow, type ProdRow } from "./panels";

export const metadata: Metadata = { title: "GST" };

export default async function GstPage({ searchParams }: { searchParams: Promise<{ outlet?: string; q?: string }> }) {
  const user = await requireCatalogEditor();
  const outlets = await getAdminOutlets(user);
  const sp = await searchParams;
  const outlet = outlets.find((o) => o.slug === sp.outlet) ?? outlets[0];
  if (!outlet) return <p className="text-zinc-500">You are not assigned to any outlet yet.</p>;

  const supabase = await createClient();
  const q = sanitizeSearch(sp.q ?? "");
  let pq = supabase.from("products").select("id, name, gst_pct, category_id").order("name").limit(100);
  if (q) pq = pq.ilike("name", `%${q}%`);
  const [{ data: o }, { data: cats }, { data: prods }, { data: allRates }] = await Promise.all([
    supabase.from("outlets").select("gst_pct").eq("id", outlet.id).single(),
    supabase.from("categories").select("id, name").order("name"),
    pq,
    supabase.from("products").select("category_id, gst_pct").limit(5000),
  ]);

  // For each category: how many products are on each rate, so a manager can see what is already set.
  const tally = new Map<string, Map<string, number>>();
  for (const r of (allRates ?? []) as { category_id: string | null; gst_pct: number | null }[]) {
    if (!r.category_id) continue;
    const key = r.gst_pct === null ? "default" : String(Number(r.gst_pct));
    const m = tally.get(r.category_id) ?? new Map<string, number>();
    m.set(key, (m.get(key) ?? 0) + 1);
    tally.set(r.category_id, m);
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">GST</h1>
        <p className="text-sm text-zinc-500">Maldives rates: 8% general sector, 17% tourism sector, and 0% for exempt items. Prices are treated as GST-inclusive. Each sale line keeps the rate it had when it was sold.</p>
      </div>
      <OutletFilter outlets={outlets} selectedSlug={outlet.slug} basePath="/admin/gst" allLabel="" />
      <GstPanels
        key={outlet.id}
        outletId={outlet.id}
        outletSlug={outlet.slug}
        outletRate={Number(o?.gst_pct ?? 0)}
        isAdmin={user.isAdmin}
        canBulk={user.canManageStore}
        query={sp.q ?? ""}
        categories={((cats ?? []) as { id: string; name: string }[]).map<CatRow>((c) => ({
          id: c.id,
          name: c.name,
          counts: Object.fromEntries(tally.get(c.id) ?? []),
        }))}
        products={((prods ?? []) as { id: string; name: string; gst_pct: number | null }[]).map<ProdRow>((p) => ({ id: p.id, name: p.name, rate: p.gst_pct === null ? "" : String(Number(p.gst_pct)) }))}
      />
    </div>
  );
}
