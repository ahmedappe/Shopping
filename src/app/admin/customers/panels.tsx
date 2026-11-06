"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adjustPoints, saveLoyalty } from "./actions";

export type CustomerRow = { id: string; name: string; phone: string; points: number; code: string; referredBy: string | null };

const num = (v: string) => Number(v.replace(/[^0-9.]/g, "")) || 0;

export function CustomerPanels({ outletId, isAdmin, canAdjust, earn, value, bonus, customers }: { outletId: string; isAdmin: boolean; canAdjust: boolean; earn: number; value: number; bonus: number; customers: CustomerRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [e, setE] = useState(String(earn));
  const [v, setV] = useState(String(value));
  const [b, setB] = useState(String(bonus));
  const [adj, setAdj] = useState<Record<string, { pts: string; why: string }>>({});

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, done: string, after?: () => void) {
    setMsg(null);
    start(async () => {
      const res = await fn();
      if (!res.ok) return setMsg({ ok: false, text: res.error ?? "Something went wrong." });
      setMsg({ ok: true, text: done });
      after?.();
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      {msg && <p className={msg.ok ? "rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800" : "rounded-lg bg-red-50 p-3 text-sm text-red-700"} role="alert">{msg.text}</p>}

      <section className="card space-y-3 p-4">
        <h2 className="font-semibold">Loyalty settings</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block"><span className="label">Points earned per 100 MVR paid</span><input className="input" inputMode="decimal" disabled={!isAdmin} value={e} onChange={(x) => setE(x.target.value)} /></label>
          <label className="block"><span className="label">1 point is worth (MVR)</span><input className="input" inputMode="decimal" disabled={!isAdmin} value={v} onChange={(x) => setV(x.target.value)} /></label>
          <label className="block"><span className="label">Bonus points for a referrer</span><input className="input" inputMode="numeric" disabled={!isAdmin} value={b} onChange={(x) => setB(x.target.value)} /></label>
        </div>
        <p className="text-sm text-zinc-500">0 earned per 100 = no points earned. 0 value = points cannot be spent. The referrer gets the bonus when the friend&apos;s first order is paid. Points are earned on money paid, not on gift cards or points.</p>
        {isAdmin ? (
          <button className="btn-primary" disabled={pending} onClick={() => run(() => saveLoyalty(outletId, num(e), num(v), Math.floor(num(b))), "Saved.")}>Save settings</button>
        ) : (
          <p className="text-sm text-zinc-500">Only an admin can change these.</p>
        )}
      </section>

      <section className="card p-4">
        <h2 className="font-semibold">Customers ({customers.length})</h2>
        {customers.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">No customers yet.</p>
        ) : (
          <ul className="mt-2 divide-y text-sm">
            {customers.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2 py-2">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{c.name} · {c.phone}</p>
                  <p className="text-zinc-500">code {c.code}{c.referredBy ? ` · referred by ${c.referredBy}` : ""}</p>
                </div>
                <p className="w-24 text-right font-semibold">{c.points} pts</p>
                {canAdjust && (
                  <>
                    <input className="input h-9 w-20" inputMode="numeric" placeholder="±pts" value={adj[c.id]?.pts ?? ""} onChange={(x) => setAdj((a) => ({ ...a, [c.id]: { pts: x.target.value.replace(/[^0-9-]/g, ""), why: a[c.id]?.why ?? "" } }))} />
                    <input className="input h-9 w-36" placeholder="Reason" value={adj[c.id]?.why ?? ""} onChange={(x) => setAdj((a) => ({ ...a, [c.id]: { pts: a[c.id]?.pts ?? "", why: x.target.value } }))} />
                    <button className="btn-outline" disabled={pending || !adj[c.id]?.pts} onClick={() => run(() => adjustPoints(c.id, Number(adj[c.id].pts), adj[c.id].why ?? ""), "Points updated.", () => setAdj((a) => ({ ...a, [c.id]: { pts: "", why: "" } })))}>Adjust</button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
