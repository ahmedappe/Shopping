"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BellRing, Bike, HandPlatter, Receipt, ShoppingBag } from "lucide-react";
import { cn } from "@/lib/utils";
import { Elapsed } from "@/components/pos/elapsed";
import { openOrder, resolveRequest } from "./actions";
import { ORDER_TYPE_LABEL } from "@/lib/pos-labels";

export type BoardTable = { id: string; name: string; seats: number };
export type BoardOrder = {
  id: string;
  orderNo: string;
  tableId: string | null;
  type: "dine_in" | "take_away" | "delivery";
  guest: string | null;
  openedAt: string;
  firstSentAt: string | null;
  total: string;
  waiting: number;
  ready: number;
};
export type BoardRequest = { id: string; tableId: string; kind: "bell" | "waiter" | "bill"; at: string };

const REQ_LABEL = { bell: "Bell", waiter: "Waiter", bill: "Bill" } as const;

export function TablesBoard({ outletId, tables, orders, requests }: { outletId: string; tables: BoardTable[]; orders: BoardOrder[]; requests: BoardRequest[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [guest, setGuest] = useState("");

  const byTable = new Map(orders.filter((o) => o.tableId).map((o) => [o.tableId!, o]));
  const loose = orders.filter((o) => !o.tableId);

  function open(tableId: string | null, type: "dine_in" | "take_away" | "delivery", guestName?: string) {
    setError(null);
    start(async () => {
      const res = await openOrder({ outletId, tableId, type, guest: guestName });
      if (!res.ok || !res.orderId) return setError(res.ok ? "Could not open the order." : res.error);
      router.push(`/pos/order/${res.orderId}`);
    });
  }

  return (
    <div className="mt-5 space-y-6">
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">Tables</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {tables.map((t) => {
            const order = byTable.get(t.id);
            const reqs = requests.filter((r) => r.tableId === t.id);
            return (
              <div key={t.id} className={cn("card relative flex min-h-32 flex-col p-3", order ? (order.ready ? "border-emerald-400 bg-emerald-50" : "border-amber-300 bg-amber-50") : "")}>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => (order ? router.push(`/pos/order/${order.id}`) : open(t.id, "dine_in"))}
                  className="flex flex-1 flex-col text-left"
                >
                  <span className="flex items-center justify-between">
                    <span className="text-xl font-bold">{t.name}</span>
                    <span className="text-xs text-zinc-500">{t.seats} seats</span>
                  </span>
                  {order ? (
                    <span className="mt-1 text-sm">
                      <span className="block font-semibold">{order.total}</span>
                      <span className="block text-zinc-600">
                        {order.firstSentAt ? <>Seated <Elapsed since={order.firstSentAt} warnAfter={45} alertAfter={90} /></> : <>Opened <Elapsed since={order.openedAt} /></>}
                      </span>
                      {order.ready > 0 && <span className="block font-semibold text-emerald-700">{order.ready} ready to serve</span>}
                      {order.waiting > 0 && <span className="block text-amber-700">{order.waiting} in kitchen / bar</span>}
                    </span>
                  ) : (
                    <span className="mt-2 text-sm text-zinc-400">Free</span>
                  )}
                </button>
                {reqs.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {reqs.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => start(async () => { await resolveRequest(r.id); router.refresh(); })}
                        className="inline-flex items-center gap-1 rounded-full bg-red-600 px-2.5 py-1 text-xs font-semibold text-white"
                        title="Tap when done"
                      >
                        {r.kind === "bill" ? <Receipt className="size-3" /> : r.kind === "bell" ? <BellRing className="size-3" /> : <HandPlatter className="size-3" />}
                        {REQ_LABEL[r.kind]} · <Elapsed since={r.at} className="text-white" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">Take away and delivery</h2>
        <div className="card flex flex-wrap items-end gap-2 p-3">
          <label className="min-w-48 flex-1">
            <span className="label">Customer name (optional)</span>
            <input className="input" value={guest} onChange={(e) => setGuest(e.target.value)} placeholder="e.g. Ali" maxLength={120} />
          </label>
          <button type="button" disabled={pending} className="btn-primary min-h-11" onClick={() => open(null, "take_away", guest)}>
            <ShoppingBag className="size-4" /> New take away
          </button>
          <button type="button" disabled={pending} className="btn-outline min-h-11" onClick={() => open(null, "delivery", guest)}>
            <Bike className="size-4" /> New delivery
          </button>
        </div>
        {loose.length > 0 && (
          <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {loose.map((o) => (
              <li key={o.id}>
                <button type="button" onClick={() => router.push(`/pos/order/${o.id}`)} className={cn("card w-full p-3 text-left", o.ready ? "border-emerald-400 bg-emerald-50" : "")}>
                  <span className="flex items-center justify-between font-semibold">
                    <span>{ORDER_TYPE_LABEL[o.type]} · {o.guest ?? o.orderNo}</span>
                    <span>{o.total}</span>
                  </span>
                  <span className="block text-sm text-zinc-600">
                    <Elapsed since={o.openedAt} /> · {o.ready > 0 ? `${o.ready} ready` : o.waiting > 0 ? `${o.waiting} preparing` : "no items yet"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
