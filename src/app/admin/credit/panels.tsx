"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatDate, formatPrice } from "@/lib/utils";
import { receivePayment, setCreditLimit } from "./actions";

export type LedgerRow = { kind: "sale" | "payment" | "adjust"; amount: number; method: string | null; reference: string | null; at: string };
export type Debtor = {
  id: string;
  name: string;
  phone: string;
  limit: number;
  balance: number;
  age: { current: number; d30: number; d60: number; d90: number };
  ledger: LedgerRow[];
};

const num = (v: string) => Number(v.replace(/[^0-9.]/g, "")) || 0;
type Method = "cash" | "card" | "transfer";

export function CreditPanels({ total, debtors, canSetLimit }: { total: number; debtors: Debtor[]; canSetLimit: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, { amount: string; method: Method; ref: string; limit: string }>>({});
  const f = (id: string, d: Debtor) => form[id] ?? { amount: "", method: "cash" as Method, ref: "", limit: String(d.limit) };
  const set = (id: string, d: Debtor, patch: Partial<ReturnType<typeof f>>) => setForm((s) => ({ ...s, [id]: { ...f(id, d), ...patch } }));

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
    <div className="space-y-4">
      {msg && <p className={msg.ok ? "rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800" : "rounded-lg bg-red-50 p-3 text-sm text-red-700"} role="alert">{msg.text}</p>}
      <p className="text-lg font-semibold">Total owed to you: {formatPrice(total)}</p>
      {debtors.length === 0 && <p className="text-sm text-zinc-500">No customers on account yet. A manager can give a customer a credit limit in Customers & loyalty.</p>}
      <ul className="space-y-3">
        {debtors.map((d) => {
          const x = f(d.id, d);
          return (
            <li key={d.id} className="card p-3">
              <button type="button" className="flex w-full flex-wrap items-center justify-between gap-2 text-left" onClick={() => setOpen(open === d.id ? null : d.id)}>
                <span className="font-medium">{d.name} · {d.phone}</span>
                <span className={d.balance > 0 ? "font-semibold text-red-700" : "text-zinc-500"}>owes {formatPrice(d.balance)} <span className="font-normal text-zinc-500">of {formatPrice(d.limit)} limit</span></span>
              </button>
              {d.balance > 0 && (
                <p className="mt-1 text-xs text-zinc-500">Age: 0–30 days {formatPrice(d.age.current)} · 31–60 {formatPrice(d.age.d30)} · 61–90 {formatPrice(d.age.d60)} · over 90 {formatPrice(d.age.d90)}</p>
              )}
              {open === d.id && (
                <div className="mt-3 space-y-3 border-t pt-3 text-sm">
                  {d.balance > 0 && (
                    <div className="space-y-2">
                      <p className="font-semibold">Receive a payment</p>
                      <div className="flex flex-wrap gap-2">
                        <input className="input w-28" inputMode="decimal" placeholder="Amount" value={x.amount} onChange={(e) => set(d.id, d, { amount: e.target.value })} />
                        {(["cash", "card", "transfer"] as const).map((m) => (
                          <button key={m} type="button" onClick={() => set(d.id, d, { method: m })} className={x.method === m ? "btn-primary capitalize" : "btn-outline capitalize"}>{m}</button>
                        ))}
                        {x.method !== "cash" && <input className="input flex-1" placeholder="Reference no." value={x.ref} maxLength={80} onChange={(e) => set(d.id, d, { ref: e.target.value })} />}
                        <button type="button" className="btn-primary" disabled={pending || !x.amount} onClick={() => run(() => receivePayment(d.id, num(x.amount), x.method, x.ref), "Payment recorded.", () => set(d.id, d, { amount: "", ref: "" }))}>Record</button>
                      </div>
                    </div>
                  )}
                  {canSetLimit && (
                    <div className="flex items-center gap-2">
                      <span>Credit limit</span>
                      <input className="input h-9 w-28" inputMode="decimal" value={x.limit} onChange={(e) => set(d.id, d, { limit: e.target.value })} />
                      <button type="button" className="btn-outline" disabled={pending} onClick={() => run(() => setCreditLimit(d.id, num(x.limit)), "Limit saved.")}>Save limit</button>
                    </div>
                  )}
                  <div>
                    <p className="font-semibold">Statement</p>
                    <ul className="divide-y">
                      {d.ledger.map((l, i) => (
                        <li key={i} className="flex justify-between py-1">
                          <span>{formatDate(l.at, true)} · {l.kind === "sale" ? "Sale on account" : l.kind === "payment" ? `Payment${l.method ? ` (${l.method}${l.reference ? ` ${l.reference}` : ""})` : ""}` : "Adjustment"}</span>
                          <span className={l.amount < 0 ? "text-emerald-700" : ""}>{l.amount < 0 ? "−" : "+"}{formatPrice(Math.abs(l.amount))}</span>
                        </li>
                      ))}
                      {d.ledger.length === 0 && <li className="py-1 text-zinc-500">Nothing yet.</li>}
                    </ul>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
