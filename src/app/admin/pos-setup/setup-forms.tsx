"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ExternalLink, Printer } from "lucide-react";
import { cn } from "@/lib/utils";
import { addTable, saveOutletPos, setStation, updateTable } from "./actions";

export type TableRow = { id: string; name: string; seats: number; active: boolean; token: string };
export type StationRow = { variantId: string; label: string; category: string; station: "kitchen" | "bar" | null };

export function OutletSettingsForm({ outletId, canEdit, serviceChargePct, header, footer }: { outletId: string; canEdit: boolean; serviceChargePct: number; header: string; footer: string }) {
  const [pct, setPct] = useState(String(serviceChargePct));
  const [h, setH] = useState(header);
  const [f, setF] = useState(footer);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <section className="card space-y-3 p-4">
      <h2 className="font-semibold">Service charge and receipt</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        <label>
          <span className="label">Service charge % (dine in only)</span>
          <input className="input" inputMode="decimal" value={pct} disabled={!canEdit} onChange={(e) => setPct(e.target.value.replace(/[^0-9.]/g, ""))} />
        </label>
        <label>
          <span className="label">Receipt header (address, phone, GST no.)</span>
          <textarea className="input" rows={3} maxLength={300} value={h} disabled={!canEdit} onChange={(e) => setH(e.target.value)} />
        </label>
        <label>
          <span className="label">Receipt footer</span>
          <textarea className="input" rows={3} maxLength={300} value={f} disabled={!canEdit} onChange={(e) => setF(e.target.value)} />
        </label>
      </div>
      {canEdit ? (
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="btn-primary"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await saveOutletPos({ outletId, serviceChargePct: Number(pct) || 0, header: h, footer: f });
                setMsg({ ok: res.ok, text: res.ok ? "Saved." : res.error });
              })
            }
          >
            Save
          </button>
          {msg && <span className={cn("text-sm", msg.ok ? "text-emerald-700" : "text-red-600")}>{msg.text}</span>}
        </div>
      ) : (
        <p className="text-xs text-zinc-500">Only an admin can change these.</p>
      )}
      <p className="text-xs text-zinc-500">Service charge is added to dine-in orders only. Take away and delivery never get it.</p>
    </section>
  );
}

export function TablesEditor({ outletId, origin, tables }: { outletId: string; origin: string; tables: TableRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [seats, setSeats] = useState("4");
  const [error, setError] = useState<string | null>(null);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) {
    setError(null);
    start(async () => {
      const res = await fn();
      if (!res.ok) return setError(res.error ?? "Something went wrong.");
      after?.();
      router.refresh();
    });
  }

  return (
    <section className="card space-y-3 p-4">
      <h2 className="font-semibold">Tables</h2>
      {error && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p>}
      <div className="flex flex-wrap items-end gap-2">
        <label><span className="label">Table name</span><input className="input w-32" value={name} maxLength={30} onChange={(e) => setName(e.target.value)} placeholder="T1" /></label>
        <label><span className="label">Seats</span><input className="input w-20" inputMode="numeric" value={seats} onChange={(e) => setSeats(e.target.value.replace(/\D/g, ""))} /></label>
        <button type="button" className="btn-primary" disabled={pending || !name.trim()} onClick={() => run(() => addTable({ outletId, name, seats: Number(seats) || 4 }), () => setName(""))}>Add table</button>
      </div>
      <ul className="divide-y">
        {tables.map((t) => {
          const url = `${origin}/t/${t.token}`;
          return (
            <li key={t.id} className="flex flex-wrap items-center gap-3 py-2">
              <span className={cn("w-24 font-semibold", !t.active && "text-zinc-400 line-through")}>{t.name}</span>
              <span className="text-sm text-zinc-500">{t.seats} seats</span>
              <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm underline"><ExternalLink className="size-3.5" /> Guest page</a>
              <a href={`/admin/pos-setup/qr?u=${encodeURIComponent(url)}&t=${encodeURIComponent(t.name)}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm underline"><Printer className="size-3.5" /> Print QR</a>
              <button type="button" className="btn-outline ml-auto h-8 px-3 text-xs" disabled={pending} onClick={() => run(() => updateTable(t.id, { isActive: !t.active }))}>
                {t.active ? "Hide" : "Show"}
              </button>
            </li>
          );
        })}
        {tables.length === 0 && <li className="py-4 text-sm text-zinc-500">No tables yet.</li>}
      </ul>
    </section>
  );
}

export function StationList({ outletId, rows }: { outletId: string; rows: StationRow[] }) {
  const [q, setQ] = useState("");
  const [state, setState] = useState<Record<string, StationRow["station"]>>(() => Object.fromEntries(rows.map((r) => [r.variantId, r.station])));
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  const shown = useMemo(() => rows.filter((r) => !q.trim() || r.label.toLowerCase().includes(q.toLowerCase()) || r.category.toLowerCase().includes(q.toLowerCase())), [rows, q]);

  function change(variantId: string, value: string) {
    const station = value === "kitchen" || value === "bar" ? value : null;
    const prev = state[variantId];
    setState((s) => ({ ...s, [variantId]: station }));
    setError(null);
    start(async () => {
      const res = await setStation(outletId, variantId, station);
      if (!res.ok) {
        setState((s) => ({ ...s, [variantId]: prev }));
        setError(res.error);
      }
    });
  }

  return (
    <section className="card space-y-3 p-4">
      <div>
        <h2 className="font-semibold">Where each item is made</h2>
        <p className="text-sm text-zinc-500">Kitchen and bar items appear on that screen and use their recipe. Items with no screen (bottled water, packed snacks) are sold straight from stock.</p>
      </div>
      <input className="input" placeholder="Search items or categories" value={q} onChange={(e) => setQ(e.target.value)} />
      {error && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p>}
      <ul className="divide-y">
        {shown.map((r) => (
          <li key={r.variantId} className="flex items-center gap-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{r.label}</p>
              <p className="text-xs text-zinc-500">{r.category}</p>
            </div>
            <select className="input w-36" value={state[r.variantId] ?? ""} onChange={(e) => change(r.variantId, e.target.value)}>
              <option value="">No screen (stock)</option>
              <option value="kitchen">Kitchen</option>
              <option value="bar">Bar</option>
            </select>
            {state[r.variantId] && <Check className="size-4 text-emerald-600" />}
          </li>
        ))}
        {shown.length === 0 && <li className="py-4 text-sm text-zinc-500">No items. Add items to this outlet in Products first.</li>}
      </ul>
    </section>
  );
}
