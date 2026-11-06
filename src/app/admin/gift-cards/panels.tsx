"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatDate, formatPrice } from "@/lib/utils";
import { issueCard, setRate, setRequireSession, topUpCard, voidCard } from "./actions";

export type Card = { code: string; initial: number; balance: number; holder: string | null; active: boolean; issuedAt: string };
export type RateRow = { code: string; rate: number };

const num = (v: string) => Number(v.replace(/[^0-9.]/g, "")) || 0;

export function MoneyPanels({ outletId, isAdmin, requireSession, cards, rates }: { outletId: string; isAdmin: boolean; requireSession: boolean; cards: Card[]; rates: RateRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [amount, setAmount] = useState("");
  const [code, setCode] = useState("");
  const [holder, setHolder] = useState("");
  const [top, setTop] = useState<Record<string, string>>({});
  const [cur, setCur] = useState("");
  const [rate, setRateText] = useState("");

  function run(fn: () => Promise<{ ok: boolean; error?: string; code?: string }>, ok?: (r: { code?: string }) => string, after?: () => void) {
    setMsg(null);
    start(async () => {
      const res = await fn();
      if (!res.ok) return setMsg({ ok: false, text: res.error ?? "Something went wrong." });
      if (ok) setMsg({ ok: true, text: ok(res) });
      after?.();
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      {msg && <p className={msg.ok ? "rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800" : "rounded-lg bg-red-50 p-3 text-sm text-red-700"} role="alert">{msg.text}</p>}

      <section className="card space-y-3 p-4">
        <h2 className="font-semibold">Issue a gift card</h2>
        <div className="grid gap-2 sm:grid-cols-3">
          <input className="input" inputMode="decimal" placeholder="Amount (MVR)" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <input className="input" placeholder="Code (blank = automatic)" value={code} maxLength={20} onChange={(e) => setCode(e.target.value.toUpperCase())} />
          <input className="input" placeholder="Name (optional)" value={holder} maxLength={120} onChange={(e) => setHolder(e.target.value)} />
        </div>
        <button className="btn-primary" disabled={pending || !amount} onClick={() => run(() => issueCard(outletId, num(amount), code, holder), (r) => `Gift card created. Code: ${r.code}`, () => { setAmount(""); setCode(""); setHolder(""); })}>
          Create gift card
        </button>
      </section>

      <section className="card p-4">
        <h2 className="font-semibold">Gift cards</h2>
        {cards.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">None issued yet.</p>
        ) : (
          <ul className="mt-2 divide-y text-sm">
            {cards.map((c) => (
              <li key={c.code} className="flex flex-wrap items-center gap-2 py-2">
                <div className="min-w-0 flex-1">
                  <p className="font-mono font-semibold">{c.code} {!c.active && <span className="font-sans text-xs text-red-600">cancelled</span>}</p>
                  <p className="text-zinc-500">{c.holder ? `${c.holder} · ` : ""}{formatDate(c.issuedAt)} · issued {formatPrice(c.initial)}</p>
                </div>
                <p className="w-28 text-right font-semibold">{formatPrice(c.balance)}</p>
                {c.active && (
                  <>
                    <input className="input h-9 w-20" inputMode="decimal" placeholder="+ add" value={top[c.code] ?? ""} onChange={(e) => setTop((t) => ({ ...t, [c.code]: e.target.value }))} />
                    <button className="btn-outline" disabled={pending || !top[c.code]} onClick={() => run(() => topUpCard(outletId, c.code, num(top[c.code])), () => "Topped up.", () => setTop((t) => ({ ...t, [c.code]: "" })))}>Top up</button>
                    <button className="btn-ghost text-red-600" disabled={pending} onClick={() => { if (confirm(`Cancel ${c.code}? Its balance goes to zero.`)) run(() => voidCard(outletId, c.code), () => "Cancelled."); }}>Cancel</button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card space-y-3 p-4">
        <h2 className="font-semibold">Foreign currency (cash)</h2>
        <p className="text-sm text-zinc-500">Set what 1 unit is worth in MVR. Cashiers can then take cash in that currency; the sale is recorded in MVR at this rate. Enter 0 to remove a currency.</p>
        <ul className="text-sm">
          {rates.map((r) => (
            <li key={r.code} className="flex justify-between py-1"><span>1 {r.code}</span><span>= {r.rate} MVR</span></li>
          ))}
        </ul>
        <div className="flex gap-2">
          <input className="input w-24" placeholder="USD" maxLength={3} value={cur} onChange={(e) => setCur(e.target.value.toUpperCase())} />
          <input className="input flex-1" inputMode="decimal" placeholder="Rate in MVR, e.g. 15.42" value={rate} onChange={(e) => setRateText(e.target.value)} />
          <button className="btn-outline" disabled={pending || cur.length !== 3 || rate === ""} onClick={() => run(() => setRate(outletId, cur, num(rate)), () => "Saved.", () => { setCur(""); setRateText(""); })}>Save</button>
        </div>
      </section>

      {isAdmin && (
        <section className="card p-4">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={requireSession} disabled={pending} onChange={(e) => run(() => setRequireSession(outletId, e.target.checked), () => "Saved.")} />
            Cashiers must open the cash drawer before taking cash payments at this outlet
          </label>
        </section>
      )}
    </div>
  );
}
