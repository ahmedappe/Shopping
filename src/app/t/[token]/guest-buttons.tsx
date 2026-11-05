"use client";

import { useState, useTransition } from "react";
import { BellRing, HandPlatter, Receipt } from "lucide-react";
import { sendTableRequest } from "./actions";

const BUTTONS = [
  { kind: "bell", label: "Ring bell", icon: BellRing },
  { kind: "waiter", label: "Call waiter", icon: HandPlatter },
  { kind: "bill", label: "Ask for bill", icon: Receipt },
] as const;

export function GuestButtons({ token }: { token: string }) {
  const [pending, start] = useTransition();
  const [note, setNote] = useState<string | null>(null);

  function tap(kind: "bell" | "waiter" | "bill") {
    setNote(null);
    start(async () => {
      const res = await sendTableRequest(token, kind);
      setNote(res.ok ? "Sent. Someone is coming." : res.error);
    });
  }

  return (
    <div className="fixed right-2 top-1/2 z-40 flex -translate-y-1/2 flex-col items-stretch gap-2">
      {BUTTONS.map(({ kind, label, icon: Icon }) => (
        <button
          key={kind}
          type="button"
          disabled={pending}
          onClick={() => tap(kind)}
          className="flex w-[4.5rem] flex-col items-center justify-center gap-1 rounded-2xl border bg-white px-1 py-3 text-center text-[11px] font-semibold leading-tight shadow-lg active:bg-zinc-100 disabled:opacity-60"
        >
          <Icon className="size-6" /> {label}
        </button>
      ))}
      {note && (
        <p role="status" className="w-[4.5rem] rounded-xl bg-emerald-600 px-1.5 py-2 text-center text-[11px] font-medium leading-tight text-white shadow-lg">
          {note}
        </p>
      )}
    </div>
  );
}
