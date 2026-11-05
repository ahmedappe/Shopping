"use client";

import { useState, useTransition } from "react";
import { saveSupplier } from "./actions";

export type SupplierInput = {
  id: string | null;
  companyId: string;
  name: string;
  contactName: string;
  phone: string;
  email: string;
  gstNumber: string;
  notes: string;
  isActive: boolean;
};

export function SupplierForm({
  companies,
  supplier,
  onDone,
}: {
  companies: { id: string; name: string }[];
  supplier: SupplierInput;
  onDone?: () => void;
}) {
  const [v, setV] = useState(supplier);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const set = (patch: Partial<SupplierInput>) => setV((s) => ({ ...s, ...patch }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const { id, ...input } = v;
      const res = await saveSupplier(id, input);
      setMsg(res.ok ? { ok: true, text: res.message ?? "Saved." } : { ok: false, text: res.error });
      if (res.ok) {
        if (!id) setV({ ...supplier, companyId: v.companyId });
        onDone?.();
      }
    });
  }

  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
      <div>
        <label className="label">Company</label>
        <select className="input" required value={v.companyId} onChange={(e) => set({ companyId: e.target.value })}>
          <option value="" disabled>Choose company</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Supplier name</label>
        <input className="input" required maxLength={120} value={v.name} onChange={(e) => set({ name: e.target.value })} />
      </div>
      <div>
        <label className="label">Contact person</label>
        <input className="input" maxLength={120} value={v.contactName} onChange={(e) => set({ contactName: e.target.value })} />
      </div>
      <div>
        <label className="label">Phone (for reorder messages)</label>
        <input className="input" maxLength={30} inputMode="tel" value={v.phone} onChange={(e) => set({ phone: e.target.value })} />
      </div>
      <div>
        <label className="label">Email</label>
        <input className="input" type="email" maxLength={200} value={v.email} onChange={(e) => set({ email: e.target.value })} />
      </div>
      <div>
        <label className="label">GST number</label>
        <input className="input" maxLength={40} value={v.gstNumber} onChange={(e) => set({ gstNumber: e.target.value })} />
      </div>
      <div className="sm:col-span-2">
        <label className="label">Notes (delivery days, minimum order…)</label>
        <textarea className="input min-h-20" maxLength={1000} value={v.notes} onChange={(e) => set({ notes: e.target.value })} />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={v.isActive} onChange={(e) => set({ isActive: e.target.checked })} /> Active
      </label>
      <div className="flex items-center gap-3 sm:col-span-2">
        <button type="submit" className="btn-primary" disabled={pending}>{pending ? "Saving…" : v.id ? "Save supplier" : "Add supplier"}</button>
        {msg && <p className={`text-sm ${msg.ok ? "text-green-700" : "text-red-600"}`}>{msg.text}</p>}
      </div>
    </form>
  );
}
