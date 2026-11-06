"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setCategoryGst, setOutletSector, setProductGst } from "./actions";

export type CatRow = { id: string; name: string; counts: Record<string, number> };
export type ProdRow = { id: string; name: string; taxable: boolean };
type Sector = "general" | "tourism";

const RATE: Record<Sector, number> = { general: 8, tourism: 17 };

export function GstPanels({ outletId, outletSlug, sector, isAdmin, canBulk, query, categories, products }: { outletId: string; outletSlug: string; sector: Sector; isAdmin: boolean; canBulk: boolean; query: string; categories: CatRow[]; products: ProdRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [sec, setSec] = useState<Sector>(sector);
  const [catPick, setCatPick] = useState<Record<string, string>>({});
  const [prod, setProd] = useState<Record<string, boolean>>(() => Object.fromEntries(products.map((p) => [p.id, p.taxable])));
  const rate = RATE[sec];

  function run(fn: () => Promise<{ ok: boolean; error?: string; count?: number }>, done: (r: { count?: number }) => string) {
    setMsg(null);
    start(async () => {
      const res = await fn();
      if (!res.ok) return setMsg({ ok: false, text: res.error ?? "Something went wrong." });
      setMsg({ ok: true, text: done(res) });
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      {msg && <p className={msg.ok ? "rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800" : "rounded-lg bg-red-50 p-3 text-sm text-red-700"} role="alert">{msg.text}</p>}

      <section className="card space-y-2 p-4">
        <h2 className="font-semibold">Is this outlet in the tourism sector?</h2>
        <p className="text-sm text-zinc-500">General sector outlets charge 8% on taxable items; tourism sector outlets (like the guesthouse) charge 17%. Items marked 0% are never taxed.</p>
        <div className="flex flex-wrap gap-2">
          {(["general", "tourism"] as const).map((s) => (
            <button key={s} type="button" disabled={!isAdmin || pending} onClick={() => { const prev = sec; setSec(s); run(() => setOutletSector(outletId, s), () => "Saved."); void prev; }} className={sec === s ? "btn-primary" : "btn-outline"}>
              {s === "general" ? "General sector · 8%" : "Tourism sector · 17%"}
            </button>
          ))}
        </div>
        {!isAdmin && <p className="text-sm text-zinc-500">Only an admin can change this.</p>}
      </section>

      {canBulk && (
        <section className="card p-4">
          <h2 className="font-semibold">By category</h2>
          <p className="text-sm text-zinc-500">Sets every product in the category. You can still change single products below. A product is shared by all outlets, so it is taxable or 0% everywhere (the rate itself follows each outlet&apos;s sector).</p>
          <ul className="mt-2 divide-y text-sm">
            {categories.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2 py-2">
                <span className="min-w-0 flex-1 font-medium">{c.name} <span className="font-normal text-zinc-500">{c.counts.taxable ?? 0} taxable · {c.counts.exempt ?? 0} at 0%</span></span>
                <select className="input h-9 w-44" value={catPick[c.id] ?? "__"} onChange={(e) => setCatPick((s) => ({ ...s, [c.id]: e.target.value }))}>
                  <option value="__" disabled>Set all to…</option>
                  <option value="taxable">Taxable ({rate}%)</option>
                  <option value="exempt">0% (exempt)</option>
                </select>
                <button className="btn-outline" disabled={pending || !catPick[c.id] || catPick[c.id] === "__"} onClick={() => run(() => setCategoryGst(c.id, catPick[c.id] === "taxable"), (r) => `Updated ${r.count ?? 0} products in ${c.name}.`)}>Apply</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card p-4">
        <h2 className="font-semibold">Single products</h2>
        <form className="mt-2 flex gap-2"><input type="hidden" name="outlet" value={outletSlug} /><input className="input flex-1" name="q" defaultValue={query} placeholder="Search a product" /><button className="btn-outline">Search</button></form>
        <ul className="mt-2 divide-y text-sm">
          {products.map((p) => (
            <li key={p.id} className="flex items-center gap-2 py-2">
              <span className="min-w-0 flex-1 truncate">{p.name}</span>
              <select className="input h-9 w-44" value={prod[p.id] ? "taxable" : "exempt"} disabled={pending} onChange={(e) => { const v = e.target.value === "taxable"; setProd((s) => ({ ...s, [p.id]: v })); run(() => setProductGst(p.id, v), () => "Saved."); }}>
                <option value="taxable">Taxable ({rate}%)</option>
                <option value="exempt">0% (exempt)</option>
              </select>
            </li>
          ))}
          {products.length === 0 && <li className="py-2 text-zinc-500">No products found.</li>}
        </ul>
        <p className="mt-2 text-xs text-zinc-500">Showing up to 100 products. Use search to find others.</p>
      </section>
    </div>
  );
}
