"use client";

import { useState, useTransition } from "react";
import { variantLabel } from "@/lib/utils";
import { savePurchasing } from "./purchasing-actions";

export type PurchasingData = {
  brand: string;
  unit: string;
  companies: { id: string; name: string; suppliers: { id: string; name: string }[]; supplierId: string; code: string }[];
  variants: { id: string; option1: string | null; option2: string | null; barcode: string; cost: string }[];
  outlets: { id: string; name: string }[];
  /** key `${outletId}:${variantId}`, only items set up at that outlet */
  cells: Record<string, { level2: string; level3: string; level4: string; reorderLevel: string; reorderQty: string; shelf: string }>;
  levelNames: string[];
  canSeeCost: boolean;
};

export function Purchasing({ productId, data }: { productId: string; data: PurchasingData }) {
  const [brand, setBrand] = useState(data.brand);
  const [unit, setUnit] = useState(data.unit);
  const [companies, setCompanies] = useState(data.companies);
  const [variants, setVariants] = useState(data.variants);
  const [cells, setCells] = useState(data.cells);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const setCell = (key: string, patch: Partial<PurchasingData["cells"][string]>) => setCells((c) => ({ ...c, [key]: { ...c[key], ...patch } }));

  function submit() {
    const input = {
      brand,
      unit,
      suppliers: companies.map((c) => ({ companyId: c.id, supplierId: c.supplierId, code: c.code })),
      variants: variants.map((v) => ({ id: v.id, barcode: v.barcode, cost: data.canSeeCost ? v.cost : "" })),
      outlets: Object.entries(cells).map(([key, c]) => {
        const [outletId, variantId] = key.split(":");
        return { outletId, variantId, ...c };
      }),
    };
    start(async () => {
      const res = await savePurchasing(productId, input);
      setMsg(res.ok ? { ok: true, text: res.message ?? "Saved." } : { ok: false, text: res.error });
    });
  }

  const name = (v: { option1: string | null; option2: string | null }) => variantLabel(v) || "Default";

  return (
    <div className="mt-4 space-y-6">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Brand</label>
          <input className="input" maxLength={80} value={brand} onChange={(e) => setBrand(e.target.value)} />
        </div>
        <div>
          <label className="label">Unit</label>
          <input className="input" maxLength={20} placeholder="pcs, kg, box, pack" value={unit} onChange={(e) => setUnit(e.target.value)} />
        </div>
      </div>

      {companies.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold">Main supplier</h3>
          <div className="mt-2 space-y-2">
            {companies.map((c, i) => (
              <div key={c.id} className="grid gap-2 sm:grid-cols-[1fr_1fr_10rem] sm:items-center">
                <span className="text-sm text-zinc-600">{c.name}</span>
                <select
                  className="input"
                  value={c.supplierId}
                  onChange={(e) => setCompanies((cs) => cs.map((x, j) => (j === i ? { ...x, supplierId: e.target.value } : x)))}
                >
                  <option value="">No supplier</option>
                  {c.suppliers.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                <input
                  className="input"
                  placeholder="Supplier's code"
                  maxLength={60}
                  value={c.code}
                  onChange={(e) => setCompanies((cs) => cs.map((x, j) => (j === i ? { ...x, code: e.target.value } : x)))}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <h3 className="text-sm font-semibold">Barcode{data.canSeeCost ? " and cost price" : ""}</h3>
        <table className="mt-2 w-full min-w-[420px] text-sm">
          <thead className="text-left text-xs text-zinc-500 uppercase">
            <tr>
              <th className="py-1 pr-2">Variant</th>
              <th className="py-1 pr-2">Barcode</th>
              {data.canSeeCost && <th className="py-1 pr-2">Cost (managers only)</th>}
            </tr>
          </thead>
          <tbody>
            {variants.map((v, i) => (
              <tr key={v.id}>
                <td className="py-1 pr-2">{name(v)}</td>
                <td className="py-1 pr-2">
                  <input className="input" inputMode="numeric" maxLength={64} value={v.barcode} onChange={(e) => setVariants((vs) => vs.map((x, j) => (j === i ? { ...x, barcode: e.target.value } : x)))} />
                </td>
                {data.canSeeCost && (
                  <td className="py-1 pr-2">
                    <input className="input w-32" type="number" min={0} step="0.01" value={v.cost} onChange={(e) => setVariants((vs) => vs.map((x, j) => (j === i ? { ...x, cost: e.target.value } : x)))} />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data.outlets.map((o) => {
        const rows = variants.filter((v) => cells[`${o.id}:${v.id}`]);
        if (rows.length === 0) return null;
        return (
          <div key={o.id} className="overflow-x-auto">
            <h3 className="text-sm font-semibold">{o.name}</h3>
            <table className="mt-2 w-full min-w-[760px] text-sm">
              <thead className="text-left text-xs text-zinc-500 uppercase">
                <tr>
                  <th className="py-1 pr-2">Variant</th>
                  {data.levelNames.slice(1, 4).map((n) => (
                    <th key={n} className="py-1 pr-2">{n} price</th>
                  ))}
                  <th className="py-1 pr-2">Reorder at</th>
                  <th className="py-1 pr-2">Order qty</th>
                  <th className="py-1 pr-2">Shelf</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((v) => {
                  const key = `${o.id}:${v.id}`;
                  const c = cells[key];
                  const num = (field: "level2" | "level3" | "level4" | "reorderLevel" | "reorderQty", step = "0.01") => (
                    <input className="input w-24" type="number" min={0} step={step} value={c[field]} onChange={(e) => setCell(key, { [field]: e.target.value } as Partial<PurchasingData["cells"][string]>)} />
                  );
                  return (
                    <tr key={key}>
                      <td className="py-1 pr-2">{name(v)}</td>
                      <td className="py-1 pr-2">{num("level2")}</td>
                      <td className="py-1 pr-2">{num("level3")}</td>
                      <td className="py-1 pr-2">{num("level4")}</td>
                      <td className="py-1 pr-2">{num("reorderLevel", "1")}</td>
                      <td className="py-1 pr-2">{num("reorderQty", "1")}</td>
                      <td className="py-1 pr-2">
                        <input className="input w-24" maxLength={40} placeholder="A3" value={c.shelf} onChange={(e) => setCell(key, { shelf: e.target.value })} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}

      <div className="flex items-center gap-3">
        <button type="button" className="btn-primary" disabled={pending} onClick={submit}>{pending ? "Saving…" : "Save purchasing & reorder"}</button>
        {msg && <p className={`text-sm ${msg.ok ? "text-green-700" : "text-red-600"}`}>{msg.text}</p>}
      </div>
    </div>
  );
}
