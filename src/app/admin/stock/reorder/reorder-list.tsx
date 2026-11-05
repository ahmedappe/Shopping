"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Copy, X } from "lucide-react";

export type ReorderLine = {
  id: string;
  productId: string;
  outletName: string;
  item: string;
  code: string | null;
  unit: string;
  have: number;
  reorderLevel: number;
  qty: number;
  shelf: string | null;
};

export type ReorderGroup = { key: string; supplierName: string; supplierPhone: string | null; lines: ReorderLine[] };

function buildMessage(group: ReorderGroup, lines: ReorderLine[], qty: Record<string, string>, deliverTo: string | null) {
  const date = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const byOutlet = new Map<string, ReorderLine[]>();
  for (const l of lines) byOutlet.set(l.outletName, [...(byOutlet.get(l.outletName) ?? []), l]);
  const out: string[] = [`Order from ${deliverTo ?? [...byOutlet.keys()].join(", ")}, ${date}`];
  for (const [outlet, ls] of byOutlet) {
    out.push("", `Deliver to: ${outlet}`);
    ls.forEach((l, i) => out.push(`${i + 1}. ${l.item}${l.code ? ` (${l.code})` : ""} - ${qty[l.id]} ${l.unit}`));
  }
  out.push("", "Thank you");
  return out.join("\n");
}

export function ReorderList({ groups, deliverTo }: { groups: ReorderGroup[]; deliverTo: string | null }) {
  const [qty, setQty] = useState<Record<string, string>>(() =>
    Object.fromEntries(groups.flatMap((g) => g.lines.map((l) => [l.id, String(l.qty)]))),
  );
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState<string | null>(null);

  if (groups.length === 0) {
    return <p className="card mt-6 p-8 text-center text-sm text-zinc-500">Nothing to reorder. Items appear here once their stock drops to the reorder level set on the product page.</p>;
  }

  async function copy(group: ReorderGroup) {
    const lines = group.lines.filter((l) => !removed.has(l.id) && Number(qty[l.id]) > 0);
    if (lines.length === 0) return;
    const text = buildMessage(group, lines, qty, deliverTo);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Older browsers: fall back to a hidden textarea.
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(group.key);
    setTimeout(() => setCopied((c) => (c === group.key ? null : c)), 2500);
  }

  return (
    <div className="mt-6 space-y-6">
      {groups.map((g) => {
        const lines = g.lines.filter((l) => !removed.has(l.id));
        return (
          <section key={g.key} className="card overflow-x-auto">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3">
              <div>
                <h2 className="font-semibold">{g.supplierName}</h2>
                <p className="text-xs text-zinc-500">
                  {lines.length} item{lines.length === 1 ? "" : "s"}
                  {g.supplierPhone && ` · ${g.supplierPhone}`}
                </p>
              </div>
              {g.key !== "none" && (
                <button type="button" className="btn-primary" onClick={() => copy(g)} disabled={lines.length === 0}>
                  {copied === g.key ? <Check className="size-4" /> : <Copy className="size-4" />}
                  {copied === g.key ? "Copied" : "Copy message"}
                </button>
              )}
            </div>
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-zinc-50 text-left text-xs font-medium text-zinc-500 uppercase">
                <tr>
                  <th className="px-4 py-2">Item</th>
                  <th className="px-3 py-2">Outlet</th>
                  <th className="px-3 py-2 text-right">In stock</th>
                  <th className="px-3 py-2 text-right">Reorder at</th>
                  <th className="px-3 py-2">Order qty</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {lines.map((l) => (
                  <tr key={l.id}>
                    <td className="px-4 py-2">
                      <Link href={`/admin/products/${l.productId}`} className="font-medium hover:underline">{l.item}</Link>
                      {(l.code || l.shelf) && (
                        <p className="text-xs text-zinc-500">
                          {l.code && `Code ${l.code}`}
                          {l.code && l.shelf && " · "}
                          {l.shelf && `Shelf ${l.shelf}`}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2">{l.outletName}</td>
                    <td className={`px-3 py-2 text-right ${l.have === 0 ? "font-semibold text-red-600" : ""}`}>{l.have}</td>
                    <td className="px-3 py-2 text-right">{l.reorderLevel}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        <input
                          className="input w-20"
                          type="number"
                          min={0}
                          step={1}
                          value={qty[l.id]}
                          onChange={(e) => setQty((q) => ({ ...q, [l.id]: e.target.value }))}
                          aria-label={`Order quantity for ${l.item}`}
                        />
                        <span className="text-xs text-zinc-500">{l.unit}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        className="btn-ghost"
                        aria-label={`Remove ${l.item} from this order`}
                        onClick={() => setRemoved((r) => new Set(r).add(l.id))}
                      >
                        <X className="size-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {g.key === "none" && (
              <p className="px-4 py-3 text-xs text-zinc-500">Set a main supplier on these products to include them in a supplier message.</p>
            )}
          </section>
        );
      })}
    </div>
  );
}
