"use client";

import { useState, useTransition } from "react";
import { decideTransfer, decideTransferBatch } from "./actions";

/** Approve/reject one transfer line, or (with batchId) every pending line of a multi-item transfer. */
export function DecideButtons({ id, batchId, count }: { id?: string; batchId?: string; count?: number }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (approve: boolean) =>
    start(async () => {
      const res = batchId ? await decideTransferBatch(batchId, approve) : await decideTransfer(id ?? "", approve);
      if (!res.ok) setError(res.error);
    });
  const all = batchId && count && count > 1 ? ` all ${count}` : "";
  return (
    <div className="flex items-center justify-end gap-2">
      {error && <span className="text-xs text-red-600">{error}</span>}
      <button type="button" className="btn-primary py-1.5" disabled={pending} onClick={() => run(true)}>Approve{all}</button>
      <button type="button" className="btn-outline py-1.5" disabled={pending} onClick={() => run(false)}>Reject{all}</button>
    </div>
  );
}
