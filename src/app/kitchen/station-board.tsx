"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Flame } from "lucide-react";
import { cn } from "@/lib/utils";
import { Elapsed } from "@/components/pos/elapsed";
import { setItemStatus } from "@/app/pos/actions";

export type Ticket = {
  orderId: string;
  label: string;
  since: string;
  items: { id: string; name: string; quantity: number; note: string | null; status: "new" | "preparing" | "ready"; at: string }[];
};

export function StationBoard({ tickets }: { tickets: Ticket[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function move(id: string, status: "preparing" | "ready") {
    setError(null);
    start(async () => {
      const res = await setItemStatus(id, status);
      if (!res.ok) setError(res.error);
      router.refresh();
    });
  }

  const cooking = tickets.filter((t) => t.items.some((i) => i.status !== "ready"));
  const waiting = tickets.filter((t) => t.items.every((i) => i.status === "ready"));

  return (
    <div className="mt-4">
      {error && <p className="mb-3 rounded-lg bg-red-900 p-3 text-sm">{error}</p>}
      {cooking.length === 0 && <p className="py-16 text-center text-xl text-zinc-400">Nothing to prepare. 🎉</p>}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {cooking.map((t) => (
          <section key={t.orderId} className="rounded-xl border-2 border-zinc-700 bg-zinc-900 p-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">{t.label}</h2>
              <Elapsed since={t.since} warnAfter={10} alertAfter={20} className="text-lg" />
            </div>
            <ul className="mt-2 space-y-2">
              {t.items.map((i) => (
                <li key={i.id} className={cn("rounded-lg p-2", i.status === "ready" ? "bg-emerald-950 text-emerald-300" : i.status === "preparing" ? "bg-amber-950" : "bg-zinc-800")}>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-bold tabular-nums">{i.quantity}×</span>
                    <span className="flex-1 text-lg font-semibold leading-tight">{i.name}</span>
                    {i.status === "new" && (
                      <button type="button" disabled={pending} onClick={() => move(i.id, "preparing")} className="inline-flex min-h-12 items-center gap-1 rounded-lg bg-amber-500 px-4 font-bold text-black">
                        <Flame className="size-5" /> Start
                      </button>
                    )}
                    {i.status === "preparing" && (
                      <button type="button" disabled={pending} onClick={() => move(i.id, "ready")} className="inline-flex min-h-12 items-center gap-1 rounded-lg bg-emerald-500 px-4 font-bold text-black">
                        <Check className="size-5" /> Ready
                      </button>
                    )}
                    {i.status === "ready" && <span className="text-sm font-semibold">Ready</span>}
                  </div>
                  {i.note && <p className="mt-1 text-sm font-medium text-yellow-300">⚠ {i.note}</p>}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      {waiting.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-400">Ready — waiting to be served</h2>
          <ul className="flex flex-wrap gap-2">
            {waiting.map((t) => (
              <li key={t.orderId} className="rounded-lg bg-emerald-950 px-3 py-2 text-emerald-300">
                <span className="font-semibold">{t.label}</span> · {t.items.map((i) => `${i.quantity}× ${i.name}`).join(", ")}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
