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
      setNote(res.ok ? "Done — someone is on the way." : res.error);
    });
  }

  return (
    <div className="fixed inset-x-0 bottom-0 border-t bg-white/95 p-3 backdrop-blur">
      <div className="mx-auto max-w-xl">
        {note && <p className="mb-2 text-center text-sm font-medium text-emerald-700">{note}</p>}
        <div className="grid grid-cols-3 gap-2">
          {BUTTONS.map(({ kind, label, icon: Icon }) => (
            <button key={kind} type="button" disabled={pending} onClick={() => tap(kind)} className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl border bg-white text-sm font-semibold active:bg-zinc-100">
              <Icon className="size-5" /> {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
