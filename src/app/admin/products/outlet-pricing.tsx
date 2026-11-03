"use client";

import { useState, useTransition } from "react";
import { variantLabel } from "@/lib/utils";
import type { Outlet } from "@/lib/types";
import { saveOutletPricing } from "./outlet-actions";

export type PricingVariant = { id: string; option1: string | null; option2: string | null };
export type PricingCell = { sold: boolean; price: string; stock: string };

export function OutletPricing({
  productId,
  outlets,
  variants,
  initial,
  defaults,
}: {
  productId: string;
  outlets: Outlet[];
  variants: PricingVariant[];
  /** key: `${outletId}:${variantId}` */
  initial: Record<string, PricingCell>;
  /** default price per variant, used when a variant is first switched on at an outlet */
  defaults: Record<string, string>;
}) {
  const [cells, setCells] = useState(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const get = (o: string, v: string): PricingCell => cells[`${o}:${v}`] ?? { sold: false, price: defaults[v] ?? "0", stock: "0" };
  const set = (o: string, v: string, patch: Partial<PricingCell>) =>
    setCells((c) => ({ ...c, [`${o}:${v}`]: { ...get(o, v), ...patch } }));

  if (outlets.length === 0) {
    return <p className="mt-3 text-sm text-zinc-500">You are not assigned to any outlet yet. Ask an admin to give you outlet access.</p>;
  }
  if (variants.length === 0) return null;

  function submit() {
    const rows = outlets.flatMap((o) =>
      variants.map((v) => {
        const c = get(o.id, v.id);
        return { variantId: v.id, outletId: o.id, sold: c.sold, price: c.price, stock: c.stock };
      }),
    );
    start(async () => {
      const res = await saveOutletPricing(productId, rows);
      setMsg(res.ok ? { ok: true, text: res.message ?? "Saved." } : { ok: false, text: res.error });
    });
  }

  return (
    <div>
      <div className="mt-4 space-y-6">
        {outlets.map((o) => (
          <div key={o.id}>
            <h3 className="text-sm font-semibold">{o.name}</h3>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[460px] text-sm">
                <thead className="text-left text-xs text-zinc-500 uppercase">
                  <tr>
                    <th className="py-1 pr-3">Variant</th>
                    <th className="px-2 py-1">Sold here</th>
                    <th className="px-2 py-1">Price</th>
                    <th className="px-2 py-1">Stock</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {variants.map((v) => {
                    const c = get(o.id, v.id);
                    return (
                      <tr key={v.id}>
                        <td className="py-2 pr-3">{variantLabel(v) || "Default"}</td>
                        <td className="px-2 py-2">
                          <input type="checkbox" checked={c.sold} onChange={(e) => set(o.id, v.id, { sold: e.target.checked })} aria-label={`Sold at ${o.name}`} />
                        </td>
                        <td className="px-2 py-2">
                          <input type="number" step="0.01" min={0} value={c.price} disabled={!c.sold} onChange={(e) => set(o.id, v.id, { price: e.target.value })} className="input w-28" />
                        </td>
                        <td className="px-2 py-2">
                          <input type="number" step="1" min={0} value={c.stock} disabled={!c.sold} onChange={(e) => set(o.id, v.id, { stock: e.target.value })} className="input w-24" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button type="button" onClick={submit} disabled={pending} className="btn-primary">
          {pending ? "Saving…" : "Save outlet prices & stock"}
        </button>
        {msg && <p className={`text-sm ${msg.ok ? "text-green-700" : "text-red-600"}`}>{msg.text}</p>}
      </div>
    </div>
  );
}
