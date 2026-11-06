"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setCategoryGst, setOutletGst, setProductGst } from "./actions";

export type CatRow = { id: string; name: string; counts: Record<string, number> };
export type ProdRow = { id: string; name: string; rate: string };

const RATES = [
  { v: "", label: "Outlet default" },
  { v: "0", label: "0% (exempt)" },
  { v: "8", label: "8% general" },
  { v: "17", label: "17% tourism" },
];

export function GstPanels({ outletId, outletSlug, outletRate, isAdmin, canBulk, query, categories, products }: { outletId: string; outletSlug: string; outletRate: number; isAdmin: boolean; canBulk: boolean; query: string; categories: CatRow[]; products: ProdRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [outlet, setOutlet] = useState(String(outletRate));
  const [catPick, setCatPick] = useState<Record<string, string>>({});
  const [prod, setProd] = useState<Record<string, string>>(() => Object.fromEntries(products.map((p) => [p.id, p.rate])));

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
        <h2 className="font-semibold">This outlet&apos;s default rate</h2>
        <p className="text-sm text-zinc-500">Used for every product that has no rate of its own. Cafes and shops: 8. Guesthouse (tourism): 17.</p>
        <div className="flex gap-2">
          <select className="input w-40" disabled={!isAdmin} value={outlet} onChange={(e) => setOutlet(e.target.value)}>
            {["0", "8", "17"].map((r) => <option key={r} value={r}>{r}%</option>)}
            {!["0", "8", "17"].includes(outlet) && <option value={outlet}>{outlet}%</option>}
          </select>
          {isAdmin ? <button className="btn-primary" disabled={pending} onClick={() => run(() => setOutletGst(outletId, Number(outlet)), () => "Saved.")}>Save</button> : <span className="self-center text-sm text-zinc-500">Only an admin can change this.</span>}
        </div>
      </section>

      {canBulk && (
        <section className="card p-4">
          <h2 className="font-semibold">By category</h2>
          <p className="text-sm text-zinc-500">Sets the rate for every product in the category (you can still change single products below). Rates apply to all outlets, since a product is shared.</p>
          <ul className="mt-2 divide-y text-sm">
            {categories.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2 py-2">
                <span className="min-w-0 flex-1 font-medium">{c.name} <span className="font-normal text-zinc-500">{Object.entries(c.counts).map(([k, n]) => `${n}× ${k === "default" ? "default" : `${k}%`}`).join(" · ")}</span></span>
                <select className="input h-9 w-40" value={catPick[c.id] ?? "__"} onChange={(e) => setCatPick((s) => ({ ...s, [c.id]: e.target.value }))}>
                  <option value="__" disabled>Set all to…</option>
                  {RATES.map((r) => <option key={r.v} value={r.v}>{r.label}</option>)}
                </select>
                <button className="btn-outline" disabled={pending || catPick[c.id] === undefined || catPick[c.id] === "__"} onClick={() => run(() => setCategoryGst(c.id, catPick[c.id]), (r) => `Updated ${r.count ?? 0} products in ${c.name}.`)}>Apply</button>
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
              <select className="input h-9 w-40" value={prod[p.id] ?? ""} disabled={pending} onChange={(e) => { const v = e.target.value; setProd((s) => ({ ...s, [p.id]: v })); run(() => setProductGst(p.id, v), () => "Saved."); }}>
                {RATES.map((r) => <option key={r.v} value={r.v}>{r.label}</option>)}
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
