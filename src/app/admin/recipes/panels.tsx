"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { addIngredient, adjustIngredient, saveRecipe, setIngredientReorder } from "./actions";

export type IngredientRow = { id: string; name: string; unit: string; qty: number; reorder: number | null };
export type RecipeItem = { variantId: string; label: string; lines: { ingredientId: string; qty: number }[] };

const fmt = (n: number) => (Math.round(n * 1000) / 1000).toString();

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) => {
    setError(null);
    start(async () => {
      const res = await fn();
      if (!res.ok) return setError(res.error ?? "Something went wrong.");
      after?.();
      router.refresh();
    });
  };
  return { pending, error, run };
}

export function IngredientsPanel({ outletId, companyId, canManage, ingredients }: { outletId: string; companyId: string; canManage: boolean; ingredients: IngredientRow[] }) {
  const { pending, error, run } = useRun();
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("kg");
  const [inputs, setInputs] = useState<Record<string, string>>({});

  return (
    <section className="card space-y-3 p-4">
      <h2 className="font-semibold">Ingredient stock at this outlet</h2>
      {error && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p>}
      {canManage && (
        <div className="flex flex-wrap items-end gap-2">
          <label><span className="label">New ingredient</span><input className="input w-48" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="Chicken" /></label>
          <label><span className="label">Unit</span><input className="input w-24" value={unit} maxLength={12} onChange={(e) => setUnit(e.target.value)} placeholder="kg" /></label>
          <button type="button" className="btn-primary" disabled={pending || !name.trim()} onClick={() => run(() => addIngredient({ companyId, name, unit }), () => setName(""))}>Add</button>
        </div>
      )}
      <ul className="divide-y">
        {ingredients.map((i) => {
          const low = i.reorder !== null && i.qty <= i.reorder;
          const v = inputs[i.id] ?? "";
          const n = Number(v);
          return (
            <li key={i.id} className="flex flex-wrap items-center gap-3 py-2">
              <span className="w-44 font-medium">{i.name}</span>
              <span className={cn("w-28 text-sm font-semibold tabular-nums", i.qty < 0 ? "text-red-600" : low ? "text-amber-600" : "")}>
                {fmt(i.qty)} {i.unit}{low && i.qty >= 0 ? " · low" : ""}
              </span>
              <input className="input w-24" inputMode="decimal" placeholder="Qty" value={v} onChange={(e) => setInputs((s) => ({ ...s, [i.id]: e.target.value.replace(/[^0-9.]/g, "") }))} />
              <button type="button" className="btn-outline h-9 px-3 text-xs" disabled={pending || !v || n <= 0} onClick={() => run(() => adjustIngredient(outletId, i.id, "add", n), () => setInputs((s) => ({ ...s, [i.id]: "" })))}>+ Received</button>
              <button type="button" className="btn-outline h-9 px-3 text-xs" disabled={pending || v === ""} onClick={() => run(() => adjustIngredient(outletId, i.id, "set", n), () => setInputs((s) => ({ ...s, [i.id]: "" })))}>Set count</button>
              {canManage && (
                <label className="ml-auto flex items-center gap-1 text-xs text-zinc-500">
                  Reorder at
                  <input
                    className="input h-9 w-20"
                    inputMode="decimal"
                    defaultValue={i.reorder ?? ""}
                    onBlur={(e) => {
                      const val = e.target.value.trim();
                      if ((val === "" ? null : Number(val)) !== i.reorder) run(() => setIngredientReorder(outletId, i.id, val === "" ? null : Number(val)));
                    }}
                  />
                </label>
              )}
            </li>
          );
        })}
        {ingredients.length === 0 && <li className="py-4 text-sm text-zinc-500">No ingredients yet.</li>}
      </ul>
    </section>
  );
}

export function RecipesPanel({ canManage, items, ingredients }: { canManage: boolean; items: RecipeItem[]; ingredients: { id: string; name: string; unit: string }[] }) {
  const { pending, error, run } = useRun();
  const [sel, setSel] = useState<string>("");
  const [q, setQ] = useState("");
  const [drafts, setDrafts] = useState<Record<string, { ingredientId: string; qty: string }[]>>({});
  const item = items.find((i) => i.variantId === sel);
  const lines = item ? (drafts[item.variantId] ?? item.lines.map((l) => ({ ingredientId: l.ingredientId, qty: String(l.qty) }))) : [];
  const setLines = (next: { ingredientId: string; qty: string }[]) => item && setDrafts((d) => ({ ...d, [item.variantId]: next }));
  const unitOf = (id: string) => ingredients.find((i) => i.id === id)?.unit ?? "";
  const shown = items.filter((i) => !q.trim() || i.label.toLowerCase().includes(q.toLowerCase()));

  return (
    <section className="card space-y-3 p-4">
      <div>
        <h2 className="font-semibold">Recipes</h2>
        <p className="text-sm text-zinc-500">Only items set to Kitchen or Bar in POS setup are listed. Enter the amount used for ONE item sold.</p>
      </div>
      {error && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p>}
      <div className="grid gap-4 md:grid-cols-[18rem_1fr]">
        <div>
          <input className="input" placeholder="Search items" value={q} onChange={(e) => setQ(e.target.value)} />
          <ul className="mt-2 max-h-96 divide-y overflow-y-auto rounded-lg border">
            {shown.map((i) => (
              <li key={i.variantId}>
                <button type="button" onClick={() => setSel(i.variantId)} className={cn("flex w-full items-center justify-between px-3 py-2 text-left text-sm", sel === i.variantId ? "bg-zinc-900 text-white" : "hover:bg-zinc-50")}>
                  <span className="truncate">{i.label}</span>
                  <span className={cn("ml-2 shrink-0 text-xs", sel === i.variantId ? "text-zinc-300" : i.lines.length ? "text-emerald-600" : "text-zinc-400")}>{i.lines.length ? `${i.lines.length} ingr.` : "none"}</span>
                </button>
              </li>
            ))}
            {shown.length === 0 && <li className="p-3 text-sm text-zinc-500">No items.</li>}
          </ul>
        </div>
        <div>
          {!item ? (
            <p className="py-8 text-center text-sm text-zinc-500">Choose an item to see or edit its recipe.</p>
          ) : (
            <div className="space-y-2">
              <h3 className="font-semibold">{item.label}</h3>
              {lines.map((l, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <select className="input flex-1" disabled={!canManage} value={l.ingredientId} onChange={(e) => setLines(lines.map((x, j) => (j === idx ? { ...x, ingredientId: e.target.value } : x)))}>
                    <option value="">Choose ingredient</option>
                    {ingredients.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                  <input className="input w-24" inputMode="decimal" disabled={!canManage} value={l.qty} onChange={(e) => setLines(lines.map((x, j) => (j === idx ? { ...x, qty: e.target.value.replace(/[^0-9.]/g, "") } : x)))} />
                  <span className="w-10 text-xs text-zinc-500">{unitOf(l.ingredientId)}</span>
                  {canManage && <button type="button" className="btn-outline h-9 px-2" onClick={() => setLines(lines.filter((_, j) => j !== idx))}><Trash2 className="size-4" /></button>}
                </div>
              ))}
              {canManage && (
                <div className="flex gap-2 pt-1">
                  <button type="button" className="btn-outline" onClick={() => setLines([...lines, { ingredientId: "", qty: "" }])}><Plus className="size-4" /> Add ingredient</button>
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={pending}
                    onClick={() => run(() => saveRecipe(item.variantId, lines.filter((l) => l.ingredientId && Number(l.qty) > 0).map((l) => ({ ingredientId: l.ingredientId, qty: Number(l.qty) }))), () => setDrafts((d) => { const c = { ...d }; delete c[item.variantId]; return c; }))}
                  >
                    Save recipe
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
