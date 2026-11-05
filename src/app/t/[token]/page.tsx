import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatPrice, variantLabel } from "@/lib/utils";
import { GuestButtons } from "./guest-buttons";

export const metadata: Metadata = { title: "Table menu", robots: { index: false } };
export const dynamic = "force-dynamic";

type Row = {
  price: number;
  variant: { option1: string | null; option2: string | null; product: { name: string; description: string | null; is_active: boolean; category: { name: string; sort_order: number } | null } | null } | null;
};

export default async function TableMenuPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[a-f0-9]{32}$/.test(token)) notFound();
  const supabase = await createClient();
  const { data: info } = await supabase.rpc("public_table_info", { p_token: token });
  const t = (info as { table_id: string; table_name: string; outlet_id: string; outlet_name: string }[] | null)?.[0];
  if (!t) notFound();

  const { data } = await supabase
    .from("outlet_variants")
    .select("price, variant:product_variants!inner(option1, option2, product:products!inner(name, description, is_active, category:categories(name, sort_order)))")
    .eq("outlet_id", t.outlet_id)
    .eq("is_active", true)
    .not("station", "is", null)
    .limit(1000);

  const groups = new Map<string, { order: number; items: { name: string; price: number; desc: string | null }[] }>();
  for (const r of (data ?? []) as unknown as Row[]) {
    const p = r.variant?.product;
    if (!p?.is_active) continue;
    const cat = p.category?.name ?? "Menu";
    const g = groups.get(cat) ?? { order: p.category?.sort_order ?? 999, items: [] };
    g.items.push({ name: `${p.name}${variantLabel(r.variant!) ? ` · ${variantLabel(r.variant!)}` : ""}`, price: Number(r.price), desc: p.description });
    groups.set(cat, g);
  }
  const sorted = [...groups.entries()].sort((a, b) => a[1].order - b[1].order || a[0].localeCompare(b[0]));

  return (
    <main className="mx-auto min-h-dvh max-w-xl px-4 pb-32 pt-6">
      <header className="text-center">
        <h1 className="text-2xl font-bold">{t.outlet_name}</h1>
        <p className="text-zinc-500">Table {t.table_name}</p>
      </header>
      <div className="mt-6 space-y-6">
        {sorted.map(([cat, g]) => (
          <section key={cat}>
            <h2 className="border-b pb-1 text-lg font-semibold">{cat}</h2>
            <ul className="mt-2 divide-y">
              {g.items.sort((a, b) => a.name.localeCompare(b.name)).map((i, n) => (
                <li key={n} className="flex items-start justify-between gap-3 py-2.5">
                  <div>
                    <p className="font-medium">{i.name}</p>
                    {i.desc && <p className="line-clamp-2 text-sm text-zinc-500">{i.desc}</p>}
                  </div>
                  <span className="shrink-0 font-semibold">{formatPrice(i.price)}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
        {sorted.length === 0 && <p className="py-10 text-center text-zinc-500">The menu is not available right now. Please ask our staff.</p>}
      </div>
      <GuestButtons token={token} />
    </main>
  );
}
