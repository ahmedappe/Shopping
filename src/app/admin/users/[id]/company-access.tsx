"use client";

import { useState, useTransition } from "react";
import { setUserCompanies } from "../actions";

type Company = { id: string; name: string };

export function CompanyAccess({
  userId,
  homeCompanyId,
  companies,
  assigned,
}: {
  userId: string;
  homeCompanyId: string | null;
  companies: Company[];
  assigned: string[];
}) {
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
      <h2 className="font-semibold">Company access</h2>
      <p className="text-xs text-zinc-500">
        The company they sign in with is always included. Tick other companies this person also works for, save, then choose their outlets below.
        They only ever see data for the companies and outlets ticked here.
      </p>
      <div className="mt-3 space-y-2">
        {companies.map((c) => {
          const home = c.id === homeCompanyId;
          return (
            <label key={c.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={home || selected.has(c.id)} disabled={home} onChange={() => toggle(c.id)} />
              {c.name}
              {home && <span className="text-xs text-zinc-500">(signs in with this company)</span>}
            </label>
          );
        })}
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          className="btn-primary"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await setUserCompanies(userId, [...selected].filter((id) => id !== homeCompanyId));
              setMsg(res.ok ? { ok: true, text: res.message ?? "Saved." } : { ok: false, text: res.error });
            })
          }
        >
          {pending ? "Saving…" : "Save company access"}
        </button>
        {msg && <p className={`text-sm ${msg.ok ? "text-green-700" : "text-red-600"}`}>{msg.text}</p>}
      </div>
    </section>
  );
}
