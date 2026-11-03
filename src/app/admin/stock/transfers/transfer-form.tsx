"use client";

import { useState, useTransition } from "react";
import type { Outlet } from "@/lib/types";
import { requestTransfer } from "./actions";

export type VariantChoice = { id: string; label: string };

const LOCATIONS = [
  ["shop", "Shop"],
  ["godown", "Godown"],
] as const;

export function TransferForm({ outlets, variants }: { outlets: Outlet[]; variants: VariantChoice[] }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [filter, setFilter] = useState("");
  const shown = filter ? variants.filter((v) => v.label.toLowerCase().includes(filter.toLowerCase())) : variants;

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const input = {
      variantId: String(fd.get("variantId") ?? ""),
      fromOutlet: String(fd.get("fromOutlet") ?? ""),
      fromLocation: String(fd.get("fromLocation") ?? ""),
      toOutlet: String(fd.get("toOutlet") ?? ""),
      toLocation: String(fd.get("toLocation") ?? ""),
      quantity: String(fd.get("quantity") ?? ""),
      note: String(fd.get("note") ?? ""),
    };
    start(async () => {
      const res = await requestTransfer(input);
      setMsg(res.ok ? { ok: true, text: res.message ?? "Requested." } : { ok: false, text: res.error });
      if (res.ok) form.reset();
    });
  }

  const outletSelect = (name: string, label: string) => (
    <div>
      <label className="label" htmlFor={name}>{label}</label>
      <div className="flex gap-2">
        <select id={name} name={name} required className="input" defaultValue="">
          <option value="" disabled>Outlet</option>
          {outlets.map((o) => (
            <option key={o.id} value={o.id}>{o.name}</option>
          ))}
        </select>
        <select name={name === "fromOutlet" ? "fromLocation" : "toLocation"} className="input w-32" defaultValue={name === "fromOutlet" ? "godown" : "shop"} aria-label={`${label} location`}>
          {LOCATIONS.map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      </div>
    </div>
  );

  return (
    <form onSubmit={onSubmit} className="mt-4 grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className="label" htmlFor="variant-search">Item</label>
        <input id="variant-search" type="search" placeholder="Type to narrow the list" value={filter} onChange={(e) => setFilter(e.target.value)} className="input mb-2" />
        <select name="variantId" required className="input" defaultValue="" size={1}>
          <option value="" disabled>Choose item ({shown.length})</option>
          {shown.slice(0, 300).map((v) => (
            <option key={v.id} value={v.id}>{v.label}</option>
          ))}
        </select>
      </div>
      {outletSelect("fromOutlet", "From")}
      {outletSelect("toOutlet", "To")}
      <div>
        <label className="label" htmlFor="quantity">Quantity</label>
        <input id="quantity" name="quantity" type="number" min={1} step={1} required className="input" />
      </div>
      <div>
        <label className="label" htmlFor="note">Note (optional)</label>
        <input id="note" name="note" maxLength={500} className="input" />
      </div>
      <div className="flex items-center gap-3 sm:col-span-2">
        <button type="submit" className="btn-primary" disabled={pending}>{pending ? "Sending…" : "Request transfer"}</button>
        {msg && <p className={`text-sm ${msg.ok ? "text-green-700" : "text-red-600"}`}>{msg.text}</p>}
      </div>
    </form>
  );
}
