"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, PackageCheck, RotateCcw, Truck, X } from "lucide-react";
import { COLLECTION_POINTS } from "@/config/store";
import type { OrderStatus } from "@/lib/types";
import { setOrderStatus } from "../actions";

type Target = "approved" | "delivered" | "rejected" | "pending";

const TRANSITIONS: Record<OrderStatus, Target[]> = {
  pending: ["approved", "rejected"],
  slip_uploaded: ["approved", "rejected", "pending"],
  approved: ["delivered", "pending", "rejected"],
  delivered: [],
  rejected: [],
};

const BUTTONS: Record<Target, { label: string; className: string; icon: typeof Check; confirm?: string }> = {
  approved: { label: "Approve payment", className: "btn-brand", icon: Check },
  delivered: { label: "Mark as delivered", className: "btn-primary", icon: Truck },
  rejected: {
    label: "Reject order",
    className: "btn-outline text-red-700 hover:bg-red-50",
    icon: X,
    confirm: "Reject this order? Stock will be returned to inventory. This cannot be undone.",
  },
  pending: { label: "Ask for a new slip", className: "btn-outline", icon: RotateCcw },
};

export function StatusActions({ orderId, status }: { orderId: string; status: OrderStatus }) {
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pendingTarget, setPendingTarget] = useState<Target | "collected" | null>(null);
  const [place, setPlace] = useState<string>(COLLECTION_POINTS[0]);
  const [otherPlace, setOtherPlace] = useState("");
  const [isPending, startTransition] = useTransition();
  const targets = TRANSITIONS[status];
  // After approval, "pending" means a payment problem was found: the customer must pay/upload again.
  const labelFor = (t: Target) =>
    t === "pending" && status === "approved" ? "Payment problem: ask for a new slip" : BUTTONS[t].label;

  if (targets.length === 0) {
    return (
      <section className="card p-5 text-sm text-zinc-600">
        This order is <strong>{status}</strong> and can no longer be changed.
      </section>
    );
  }

  function run(target: Target) {
    const cfg = BUTTONS[target];
    if (cfg.confirm && !window.confirm(cfg.confirm)) return;
    if ((target === "rejected" || target === "pending") && !note.trim()) {
      setMessage({ ok: false, text: "Please add a note for the customer explaining why." });
      return;
    }
    setMessage(null);
    setPendingTarget(target);
    startTransition(async () => {
      const res = await setOrderStatus({ orderId, status: target, note: note.trim() || undefined });
      setMessage(res.ok ? { ok: true, text: res.message ?? "Updated." } : { ok: false, text: res.error });
      if (res.ok) setNote("");
      setPendingTarget(null);
    });
  }

  function markCollected() {
    const location = place === "__other" ? otherPlace.trim() : place;
    if (!location) {
      setMessage({ ok: false, text: "Type where the customer collected the order." });
      return;
    }
    setMessage(null);
    setPendingTarget("collected");
    startTransition(async () => {
      const res = await setOrderStatus({
        orderId,
        status: "delivered",
        note: note.trim() || undefined,
        collectionLocation: location,
      });
      setMessage(res.ok ? { ok: true, text: `Marked as collected from ${location}.` } : { ok: false, text: res.error });
      if (res.ok) setNote("");
      setPendingTarget(null);
    });
  }

  return (
    <section className="card p-5">
      <h2 className="font-semibold">Update status</h2>
      <label htmlFor="note" className="label mt-3">
        Note to customer <span className="font-normal text-zinc-400">(required when rejecting or asking for a new slip)</span>
      </label>
      <textarea
        id="note"
        rows={2}
        maxLength={1000}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        className="input"
        placeholder="e.g. Amount on slip doesn't match"
      />
      <div className="mt-4 grid gap-2">
        {targets.map((t) => {
          const { className, icon: Icon } = BUTTONS[t];
          const label = labelFor(t);
          return (
            <button key={t} type="button" className={`${className} w-full`} disabled={isPending} onClick={() => run(t)}>
              {pendingTarget === t ? <Loader2 className="size-4 animate-spin" /> : <Icon className="size-4" />}
              {label}
            </button>
          );
        })}
      </div>
      {status === "approved" && (
        <div className="mt-5 border-t border-zinc-200 pt-4">
          <p className="text-sm font-medium">Customer collected it instead?</p>
          <label htmlFor="collect-place" className="label mt-2">
            Collected from
          </label>
          <select
            id="collect-place"
            className="input"
            value={place}
            onChange={(e) => setPlace(e.target.value)}
            disabled={isPending}
          >
            {COLLECTION_POINTS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
            <option value="__other">Other place…</option>
          </select>
          {place === "__other" && (
            <input
              className="input mt-2"
              placeholder="e.g. Hulhumalé branch"
              maxLength={100}
              value={otherPlace}
              onChange={(e) => setOtherPlace(e.target.value)}
              aria-label="Other collection place"
            />
          )}
          <button type="button" className="btn-outline mt-3 w-full" disabled={isPending} onClick={markCollected}>
            {pendingTarget === "collected" ? <Loader2 className="size-4 animate-spin" /> : <PackageCheck className="size-4" />}
            Mark as collected
          </button>
        </div>
      )}
      {message && (
        <p role="status" className={`mt-3 text-sm ${message.ok ? "text-green-700" : "text-red-600"}`}>
          {message.text}
        </p>
      )}
    </section>
  );
}
