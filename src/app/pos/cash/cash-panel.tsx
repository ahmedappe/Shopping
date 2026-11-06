"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatDate, formatPrice } from "@/lib/utils";
import { cashMovement, closeDrawer, openDrawer } from "./actions";

type Props = {
  outletId: string;
  session: { id: string; float: number; since: string } | null;
  expected: number | null;
  moves: { id: string; kind: "pay_in" | "pay_out"; amount: number; reason: string; at: string }[];
  showExpected: boolean;
};

const num = (v: string) => Number(v.replace(/[^0-9.]/g, "")) || 0;

export function CashPanel({ outletId, session, expected, moves, showExpected }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [float, setFloat] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [counted, setCounted] = useState("");
  const [note, setNote] = useState("");

  function run(fn: () => Promise<{ ok: boolean; error?: string; variance?: number }>, after?: (v?: number) => void) {
    setMsg(null);
    start(async () => {
      const res = await fn();
      if (!res.ok) return setMsg({ ok: false, text: res.error ?? "Something went wrong." });
      after?.(res.variance);
      router.refresh();
    });
  }

  if (!session) {
    return (
      <section className="card space-y-3 p-4">
        <h2 className="font-semibold">Open the drawer</h2>
        <p className="text-sm text-zinc-500">Count the cash in the drawer now and enter it. This is the starting float.</p>
        <div className="flex gap-2">
          <input className="input flex-1" inputMode="decimal" placeholder="Starting cash (MVR)" value={float} onChange={(e) => setFloat(e.target.value)} />
          <button className="btn-primary" disabled={pending} onClick={() => run(() => openDrawer(outletId, num(float)), () => setFloat(""))}>Open drawer</button>
        </div>
        {msg && <p className={msg.ok ? "text-sm text-emerald-700" : "text-sm text-red-600"} role="alert">{msg.text}</p>}
      </section>
    );
  }

  return (
    <div className="space-y-5">
      <section className="card p-4">
        <p className="text-sm text-zinc-500">Open since {formatDate(session.since, true)} · starting cash {formatPrice(session.float)}</p>
        {showExpected && expected !== null && <p className="mt-1 text-2xl font-bold">Should be in drawer: {formatPrice(expected)}</p>}
      </section>

      <section className="card space-y-3 p-4">
        <h2 className="font-semibold">Cash in / out</h2>
        <p className="text-sm text-zinc-500">For money added to or taken from the drawer that is not a sale (e.g. bought milk).</p>
        <div className="grid gap-2 sm:grid-cols-[8rem_1fr]">
          <input className="input" inputMode="decimal" placeholder="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <input className="input" placeholder="Reason" value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} />
        </div>
        <div className="flex gap-2">
          {(["pay_in", "pay_out"] as const).map((k) => (
            <button key={k} className="btn-outline flex-1" disabled={pending} onClick={() => run(() => cashMovement(session.id, k, num(amount), reason), () => { setAmount(""); setReason(""); })}>
              {k === "pay_in" ? "Put cash in" : "Take cash out"}
            </button>
          ))}
        </div>
        {moves.length > 0 && (
          <ul className="divide-y text-sm">
            {moves.map((m) => (
              <li key={m.id} className="flex justify-between py-1.5"><span>{m.kind === "pay_in" ? "In" : "Out"} · {m.reason}</span><span>{m.kind === "pay_in" ? "+" : "−"}{formatPrice(m.amount)}</span></li>
            ))}
          </ul>
        )}
      </section>

      <section className="card space-y-3 p-4">
        <h2 className="font-semibold">Close the drawer</h2>
        <p className="text-sm text-zinc-500">Count all the cash and enter the total. {showExpected ? "" : "A manager sees whether it matches."}</p>
        <div className="flex gap-2">
          <input className="input flex-1" inputMode="decimal" placeholder="Cash counted (MVR)" value={counted} onChange={(e) => setCounted(e.target.value)} />
        </div>
        <input className="input" placeholder="Note (optional)" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
        <button
          className="btn-primary w-full"
          disabled={pending || counted === ""}
          onClick={() =>
            run(
              () => closeDrawer(session.id, num(counted), note),
              (v) => {
                setCounted("");
                setNote("");
                if (showExpected && v !== undefined) setMsg({ ok: v === 0, text: v === 0 ? "Closed. Cash balanced." : v > 0 ? `Closed. ${formatPrice(v)} over.` : `Closed. ${formatPrice(-v)} short.` });
              },
            )
          }
        >
          Close drawer
        </button>
        {msg && <p className={msg.ok ? "text-sm text-emerald-700" : "text-sm text-red-600"} role="alert">{msg.text}</p>}
      </section>
    </div>
  );
}
