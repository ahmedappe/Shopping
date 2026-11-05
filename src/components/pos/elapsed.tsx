"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export function formatElapsed(ms: number) {
  const m = Math.max(0, Math.floor(ms / 60000));
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

/** Live "how long since" timer. `warnAfter` / `alertAfter` are minutes and change the colour. */
export function Elapsed({ since, warnAfter, alertAfter, className }: { since: string; warnAfter?: number; alertAfter?: number; className?: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(t);
  }, []);
  if (now === null) return <span className={className}>…</span>;
  const ms = now - new Date(since).getTime();
  const min = ms / 60000;
  return (
    <span className={cn("tabular-nums", alertAfter && min >= alertAfter ? "font-bold text-red-600" : warnAfter && min >= warnAfter ? "font-semibold text-amber-600" : "", className)}>
      {formatElapsed(ms)}
    </span>
  );
}
