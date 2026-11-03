"use client";

import { useState, useTransition } from "react";
import { decideTransfer } from "./actions";

export function DecideButtons({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (approve: boolean) =>
    start(async () => {
      const res = await decideTransfer(id, approve);
      if (!res.ok) setError(res.error);
    });
  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-xs text-red-600">{error}</span>}
      <button type="button" className="btn-primary py-1.5" disabled={pending} onClick={() => run(true)}>Approve</button>
      <button type="button" className="btn-outline py-1.5" disabled={pending} onClick={() => run(false)}>Reject</button>
    </div>
  );
}
