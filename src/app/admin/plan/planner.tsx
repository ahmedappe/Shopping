"use client";

import { useMemo, useState } from "react";
import { Copy, Plus, Trash2 } from "lucide-react";
import { searchItems } from "@/lib/item-search";

export type PlanItem = { id: string; label: string };
export type PlanLine = { variantId: string; ingredientId: string; qty: number };
export type PlanIngredient = { id: string; name: string; unit: string; onHand: number };

const fmt = (n: number) => (Math.round(n * 1000) / 1000).toString();

export function Planner({ outletName, items, lines, ingredients }: { outletName: string; items: PlanItem[]; lines: PlanLine[]; ingredients: PlanIngredient[] }) {
  const [query, setQuery] = useState("");
  const [order, setOrder] = useState<{ id: string; qty: number }[]>([]);
  const [copied, setCopied] = useState(false);

  const matches = useMemo(() => searchItems(query, items, 8), [query, items]);
  const labelOf = (id: string) => items.find((i) => i.id === id)?.label ?? "";

  const needs = useMemo(() => {
    const need = new Map<string, number>();
    for (const o of order) for (const l of lines) if (l.variantId === o.id) need.set(l.ingredientId, (need.get(l.ingredientId) ?? 0) + l.qty * o.qty);
    return ingredients
      .filter((i) => need.has(i.id))
      .map((i) => ({ ...i, need: need.get(i.id)!, short: Math.max(0, need.get(i.id)! - Math.max(0, i.onHand)) }))
      .sort((a, b) => b.short - a.short || a.name.localeCompare(b.name));
  }, [order, lines, ingredients]);

  const noRecipe = order.filter((o) => !lines.some((l) => l.variantId === o.id)).map((o) => labelOf(o.id));
  const shortages = needs.filter((n) => n.short > 0);

  function add(id: string) {
    setOrder((cur) => (cur.some((o) => o.id === id) ? cur : [...cur, { id, qty: 10 }]));
    setQuery("");
  }

  async function copy() {
    const text =
      `Shopping list for a big order at ${outletName}:\n` +
      (shortages.length ? shortages.map((s) => `- ${s.name}: ${fmt(s.short)} ${s.unit}`).join("\n") : "Nothing short — we have enough.");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked: the list is visible on screen anyway */
    }
  }

  return (
    <div className="space-y-4">
      <section className="card space-y-3 p-4">
        <div className="relative">
          <input className="input" placeholder="Search a dish to add…" value={query} onChange={(e) => setQuery(e.target.value)} />
          {matches.length > 0 && (
            <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-lg">
              {matches.map((m) => (
                <li key={m.id}>
                  <button type="button" onClick={() => add(m.id)} className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-zinc-50">
                    {m.label} <Plus className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {order.length === 0 ? (
          <p className="text-sm text-zinc-500">No dishes added yet.</p>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {order.map((o) => (
              <li key={o.id} className="flex items-center gap-3 py-2">
                <span className="min-w-0 flex-1 truncate">{labelOf(o.id)}</span>
                <input
                  className="input h-9 w-20 text-right"
                  inputMode="numeric"
                  value={o.qty}
                  onChange={(e) => setOrder((cur) => cur.map((x) => (x.id === o.id ? { ...x, qty: Number(e.target.value.replace(/\D/g, "")) || 0 } : x)))}
                />
                <button type="button" aria-label="Remove" onClick={() => setOrder((cur) => cur.filter((x) => x.id !== o.id))} className="text-zinc-400 hover:text-red-600">
                  <Trash2 className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {noRecipe.length > 0 && <p className="text-sm text-amber-700">No recipe set for: {noRecipe.join(", ")}. Add one in Recipes to include it.</p>}
      </section>

      {needs.length > 0 && (
        <section className="card space-y-3 p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Ingredients needed</h2>
            <button type="button" onClick={copy} className="btn-outline inline-flex items-center gap-1 text-sm">
              <Copy className="size-4" /> {copied ? "Copied" : "Copy shopping list"}
            </button>
          </div>
          <table className="w-full text-sm">
            <thead className="text-left text-zinc-500">
              <tr><th className="py-1">Ingredient</th><th className="text-right">Need</th><th className="text-right">On hand</th><th className="text-right">Short</th></tr>
            </thead>
            <tbody>
              {needs.map((n) => (
                <tr key={n.id} className={n.short > 0 ? "font-semibold text-red-700" : ""}>
                  <td className="py-1">{n.name}</td>
                  <td className="text-right tabular-nums">{fmt(n.need)} {n.unit}</td>
                  <td className="text-right tabular-nums">{fmt(n.onHand)}</td>
                  <td className="text-right tabular-nums">{n.short > 0 ? `${fmt(n.short)} ${n.unit}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {shortages.length === 0 && <p className="text-sm text-emerald-700">You have enough of everything.</p>}
        </section>
      )}
    </div>
  );
}
