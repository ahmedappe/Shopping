"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { Minus, Plus, Search, Sparkles, Trash2 } from "lucide-react";
import { searchItems } from "@/lib/item-search";
import { cn } from "@/lib/utils";
import { requestTransferBatch } from "@/app/admin/stock/transfers/actions";

export type BuilderItem = { id: string; label: string; barcode: string | null; sku: string | null; unit: string; shelf?: string | null };
export type BuilderOutlet = { id: string; name: string };
type Loc = "shop" | "godown";
type Line = { variantId: string; quantity: number };

/**
 * Multi-item transfer: search an item (name, barcode or a rough spelling), enter the quantity,
 * add it to the list, repeat, then confirm once. Used on the transfers page and the godown tablet.
 */
export function TransferBuilder({
  outlets,
  items,
  stock,
  fixedFrom,
  defaultTo,
  checkStockFor,
  large = false,
}: {
  outlets: BuilderOutlet[];
  items: BuilderItem[];
  /** key `${outletId}:${variantId}` */
  stock: Record<string, { shop: number; godown: number }>;
  /** Tablet mode: the source is fixed (this godown). */
  fixedFrom?: { outletId: string; location: Loc };
  defaultTo?: { outletId: string; location: Loc };
  /** Outlets whose stock this user can see; stock is checked only when the source is one of them. */
  checkStockFor: string[];
  large?: boolean;
}) {
  const [fromOutlet, setFromOutlet] = useState(fixedFrom?.outletId ?? "");
  const [fromLoc, setFromLoc] = useState<Loc>(fixedFrom?.location ?? "godown");
  const [toOutlet, setToOutlet] = useState(defaultTo?.outletId ?? "");
  const [toLoc, setToLoc] = useState<Loc>(defaultTo?.location ?? "shop");
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<BuilderItem | null>(null);
  const [qty, setQty] = useState("1");
  const [lines, setLines] = useState<Line[]>([]);
  const [note, setNote] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const searchRef = useRef<HTMLInputElement>(null);

  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const results = useMemo(() => searchItems(query, items, large ? 12 : 20), [query, items, large]);
  const have = (variantId: string) => {
    const s = stock[`${fromOutlet}:${variantId}`];
    return s ? s[fromLoc] : 0;
  };
  const known = checkStockFor.includes(fromOutlet);
  const inList = (variantId: string) => lines.filter((l) => l.variantId === variantId).reduce((n, l) => n + l.quantity, 0);
  const btn = large ? "min-h-14 text-base" : "";

  function pick(item: BuilderItem) {
    setPicked(item);
    setQty("1");
    setMsg(null);
  }

  function addLine() {
    if (!picked) return;
    const n = Number(qty);
    if (!Number.isInteger(n) || n < 1) return setMsg({ ok: false, text: "Enter a whole number of 1 or more." });
    const left = have(picked.id) - inList(picked.id);
    if (known && n > left) return setMsg({ ok: false, text: `Only ${left} ${picked.unit} left at the source.` });
    setLines((ls) => {
      const i = ls.findIndex((l) => l.variantId === picked.id);
      if (i >= 0) return ls.map((l, j) => (j === i ? { ...l, quantity: l.quantity + n } : l));
      return [...ls, { variantId: picked.id, quantity: n }];
    });
    setPicked(null);
    setQuery("");
    setMsg(null);
    searchRef.current?.focus();
  }

  function submit() {
    start(async () => {
      const res = await requestTransferBatch({ fromOutlet, fromLocation: fromLoc, toOutlet, toLocation: toLoc, lines, note });
      if (res.ok) {
        setLines([]);
        setNote("");
        setConfirming(false);
        setMsg({ ok: true, text: res.message ?? "Sent." });
      } else {
        setMsg({ ok: false, text: res.error });
      }
    });
  }

  const outletName = (id: string) => outlets.find((o) => o.id === id)?.name ?? "";
  const placeLabel = (o: string, l: Loc) => `${outletName(o)} ${l === "godown" ? "godown" : "shop"}`;
  const canConfirm = lines.length > 0 && fromOutlet && toOutlet && !(fromOutlet === toOutlet && fromLoc === toLoc);

  const placePicker = (label: string, outlet: string, setOutlet: (v: string) => void, loc: Loc, setLoc: (v: Loc) => void, locked = false) => (
    <div>
      <span className="label">{label}</span>
      <div className="flex gap-2">
        <select className={cn("input", btn)} value={outlet} disabled={locked} onChange={(e) => setOutlet(e.target.value)} aria-label={`${label} outlet`}>
          <option value="" disabled>Outlet</option>
          {outlets.map((o) => (
            <option key={o.id} value={o.id}>{o.name}</option>
          ))}
        </select>
        <select className={cn("input w-32", btn)} value={loc} disabled={locked} onChange={(e) => setLoc(e.target.value as Loc)} aria-label={`${label} place`}>
          <option value="godown">Godown</option>
          <option value="shop">Shop</option>
        </select>
      </div>
    </div>
  );

  if (confirming) {
    return (
      <div className="mt-4">
        <h3 className={cn("font-semibold", large && "text-xl")}>Confirm transfer</h3>
        <p className="mt-1 text-sm text-zinc-600">
          From <strong>{placeLabel(fromOutlet, fromLoc)}</strong> to <strong>{placeLabel(toOutlet, toLoc)}</strong>
        </p>
        <ul className="mt-3 divide-y divide-zinc-100 rounded-lg border border-zinc-200">
          {lines.map((l) => {
            const item = byId.get(l.variantId);
            return (
              <li key={l.variantId} className={cn("flex items-center justify-between px-4 py-2", large && "py-3 text-lg")}>
                <span>{item?.label}</span>
                <span className="text-right">
                  <strong>{l.quantity} {item?.unit}</strong>
                  {known && <span className="block text-xs text-zinc-500">{have(l.variantId) - l.quantity} left at source</span>}
                </span>
              </li>
            );
          })}
        </ul>
        <div className="mt-3">
          <label className="label" htmlFor="tb-note">Note (optional)</label>
          <input id="tb-note" className="input" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" className={cn("btn-primary", btn, large && "px-8")} disabled={pending} onClick={submit}>{pending ? "Sending…" : "Confirm"}</button>
          <button type="button" className={cn("btn-outline", btn)} disabled={pending} onClick={() => setConfirming(false)}>Back</button>
          {msg && <p className={`text-sm ${msg.ok ? "text-green-700" : "text-red-600"}`}>{msg.text}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {placePicker("From", fromOutlet, setFromOutlet, fromLoc, setFromLoc, Boolean(fixedFrom))}
        {placePicker("To", toOutlet, setToOutlet, toLoc, setToLoc)}
      </div>

      <div>
        <label className="label" htmlFor="tb-search">Item</label>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-zinc-400" />
          <input
            id="tb-search"
            ref={searchRef}
            type="search"
            autoFocus={large}
            autoComplete="off"
            placeholder="Type a few letters, a rough spelling, or scan the barcode"
            className={cn("input pl-9", large && "min-h-14 text-lg")}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPicked(null);
            }}
            onKeyDown={(e) => {
              // A scanner types the barcode then Enter: pick the exact match straight away.
              if (e.key === "Enter" && results[0]) {
                e.preventDefault();
                pick(results[0]);
              }
            }}
          />
        </div>
        {query && !picked && (
          <ul className={cn("mt-2 grid gap-2", large ? "sm:grid-cols-2" : "")}>
            {results.map((item, i) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => pick(item)}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left hover:bg-zinc-50",
                    i === 0 ? "border-zinc-900" : "border-zinc-200",
                    large && "min-h-16 text-base",
                  )}
                >
                  <span>
                    {i === 0 && <Sparkles className="mr-1 inline size-4 text-amber-500" aria-label="Best match" />}
                    {item.label}
                    {item.shelf && <span className="block text-xs text-zinc-500">Shelf {item.shelf}</span>}
                  </span>
                  {known && <span className="shrink-0 text-sm text-zinc-500">{have(item.id)} {item.unit}</span>}
                </button>
              </li>
            ))}
            {results.length === 0 && <li className="text-sm text-zinc-500">No match. Try fewer letters or scan the barcode.</li>}
          </ul>
        )}
      </div>

      {picked && (
        <div className="rounded-lg border border-zinc-900 p-4">
          <p className={cn("font-semibold", large && "text-lg")}>{picked.label}</p>
          {known && <p className="text-sm text-zinc-500">{have(picked.id) - inList(picked.id)} {picked.unit} available at the source</p>}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" className={cn("btn-outline", btn)} aria-label="One less" onClick={() => setQty((q) => String(Math.max(1, Number(q || 0) - 1)))}>
              <Minus className="size-4" />
            </button>
            <input
              className={cn("input w-28 text-center", large && "min-h-14 text-2xl")}
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addLine();
                }
              }}
              aria-label="Quantity"
            />
            <button type="button" className={cn("btn-outline", btn)} aria-label="One more" onClick={() => setQty((q) => String(Number(q || 0) + 1))}>
              <Plus className="size-4" />
            </button>
            <button type="button" className={cn("btn-outline", btn)} onClick={() => setQty((q) => String(Number(q || 0) + 5))}>+5</button>
            <span className="text-sm text-zinc-500">{picked.unit}</span>
            <button type="button" className={cn("btn-primary ml-auto", btn)} onClick={addLine}>Add to list</button>
          </div>
        </div>
      )}

      {lines.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold">Transfer list ({lines.length})</h3>
          <ul className="mt-2 divide-y divide-zinc-100 rounded-lg border border-zinc-200">
            {lines.map((l) => {
              const item = byId.get(l.variantId);
              return (
                <li key={l.variantId} className={cn("flex items-center justify-between gap-3 px-4 py-2", large && "py-3 text-base")}>
                  <span>{item?.label}</span>
                  <span className="flex items-center gap-3">
                    <strong>{l.quantity} {item?.unit}</strong>
                    <button type="button" className="btn-ghost" aria-label={`Remove ${item?.label}`} onClick={() => setLines((ls) => ls.filter((x) => x.variantId !== l.variantId))}>
                      <Trash2 className="size-4" />
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={cn("btn-primary", btn, large && "px-8")} disabled={!canConfirm} onClick={() => setConfirming(true)}>
          Review &amp; confirm
        </button>
        {msg && <p className={`text-sm ${msg.ok ? "text-green-700" : "text-red-600"}`}>{msg.text}</p>}
      </div>
    </div>
  );
}
