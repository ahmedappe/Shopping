"use client";

import { useState, useTransition } from "react";
import type { Outlet } from "@/lib/types";
import { setUserOutlets } from "../actions";

export function OutletAccess({ userId, outlets, assigned }: { userId: string; outlets: Outlet[]; assigned: string[] }) {
  const [selected, setSelected] = useState(new Set(assigned));
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <section className="card mt-6 p-5">
      <h2 className="font-semibold">Outlet access</h2>
      <p className="text-xs text-zinc-500">
        Staff and managers only see orders, stock and prices for the outlets ticked here. Admins always see every outlet.
      </p>
      <div className="mt-3 space-y-2">
        {outlets.map((o) => (
          <label key={o.id} className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={selected.has(o.id)} onChange={() => toggle(o.id)} /> {o.name}
          </label>
        ))}
        {outlets.length === 0 && <p className="text-sm text-zinc-500">No outlets yet.</p>}
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          className="btn-primary"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await setUserOutlets(userId, [...selected]);
              setMsg(res.ok ? { ok: true, text: res.message ?? "Saved." } : { ok: false, text: res.error });
            })
          }
        >
          {pending ? "Saving…" : "Save outlet access"}
        </button>
        {msg && <p className={`text-sm ${msg.ok ? "text-green-700" : "text-red-600"}`}>{msg.text}</p>}
      </div>
    </section>
  );
}
