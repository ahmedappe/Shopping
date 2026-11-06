"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Camera, Check, Minus, Plus, Printer, Search, Send, Trash2, X } from "lucide-react";
import { searchItems } from "@/lib/item-search";
import { cn, formatPrice } from "@/lib/utils";
import { ITEM_STATUS_LABEL, ORDER_TYPE_LABEL } from "@/lib/pos-labels";
import { Elapsed } from "@/components/pos/elapsed";
import { CameraScanner, cameraScanSupported } from "./camera-scanner";
import { OrderExtras, type DeliveryInfo, type OrderCustomer, type StaffOption } from "./order-extras";
import { addItems, cancelOrder, closeOrder, setItemStatus, voidItem } from "../../actions";

export type MenuItem = {
  id: string;
  label: string;
  sku: string | null;
  barcode: string | null;
  price: number;
  category: string;
  station: "kitchen" | "bar" | null;
  /** Shelf items only (no kitchen / bar screen). */
  stock: number | null;
  /** Made-in-advance items: portions already prepared. */
  ready: number | null;
};
export type OrderLine = {
  id: string;
  name: string;
  unit_price: number;
  quantity: number;
  note: string | null;
  station: "kitchen" | "bar" | null;
  status: "new" | "preparing" | "ready" | "served" | "void";
  created_at: string;
};
export type OrderData = {
  id: string;
  orderNo: string;
  outletSlug: string;
  outletName: string;
  tableName: string | null;
  type: "dine_in" | "take_away" | "delivery";
  status: "open" | "closed" | "cancelled";
  guest: string | null;
  openedAt: string;
  firstSentAt: string | null;
  subtotal: number;
  discount: number;
  serviceCharge: number;
  serviceChargePct: number;
  total: number;
  canManage: boolean;
};
type Draft = { id: string; qty: number; note: string };
type Pay = { method: "cash" | "card" | "transfer" | "gift_card" | "points"; amount: string; reference: string; currency: string };
export type Rate = { code: string; rate: number };
export type Extras = { orderId: string; outletId: string; customer: OrderCustomer | null; pointValue: number; loyaltyOn: boolean; isDelivery: boolean; delivery: DeliveryInfo; staff: StaffOption[] };

const STATUS_STYLE: Record<OrderLine["status"], string> = {
  new: "bg-zinc-100 text-zinc-700",
  preparing: "bg-amber-100 text-amber-800",
  ready: "bg-emerald-100 text-emerald-800",
  served: "bg-sky-100 text-sky-800",
  void: "bg-red-100 text-red-700 line-through",
};

export function OrderScreen({ order, lines, menu, rates, extras }: { order: OrderData; lines: OrderLine[]; menu: MenuItem[]; rates: Rate[]; extras: Extras }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("All");
  const [draft, setDraft] = useState<Draft[]>([]);
  const [paying, setPaying] = useState(false);
  const [discount, setDiscount] = useState("");
  const [pays, setPays] = useState<Pay[]>([{ method: "cash", amount: "", reference: "", currency: "MVR" }]);

  const [camera, setCamera] = useState(false);
  const [lastScan, setLastScan] = useState<{ ok: boolean; text: string } | null>(null);
  const scanQueue = useRef<Map<string, number>>(new Map());
  const scanTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const open = order.status === "open";
  const byId = useMemo(() => new Map(menu.map((m) => [m.id, m])), [menu]);
  const categories = useMemo(() => ["All", ...Array.from(new Set(menu.map((m) => m.category))).sort()], [menu]);
  const shown = useMemo(() => {
    if (query.trim()) return searchItems(query, menu, 40);
    return category === "All" ? menu : menu.filter((m) => m.category === category);
  }, [query, menu, category]);

  const draftTotal = draft.reduce((n, d) => n + (byId.get(d.id)?.price ?? 0) * d.qty, 0);
  const live = lines.filter((l) => l.status !== "void");
  const discountNum = Math.max(0, Number(discount) || 0);
  const scNow = order.type === "dine_in" ? Math.round(Math.max(order.subtotal - discountNum, 0) * order.serviceChargePct) / 100 : 0;
  const totalNow = Math.max(order.subtotal - discountNum, 0) + scNow;
  const rateOf = (c: string) => (c === "MVR" ? 1 : rates.find((r) => r.code === c)?.rate ?? 0);
  const mvrOf = (p: Pay) => Math.round((Number(p.amount) || 0) * (p.method === "points" ? extras.pointValue : rateOf(p.currency)) * 100) / 100;
  const paidSum = pays.reduce((n, p) => n + mvrOf(p), 0);
  const unserved = live.filter((l) => l.status !== "served").length;

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) {
    setMsg(null);
    start(async () => {
      const res = await fn();
      if (!res.ok) return setMsg({ ok: false, text: res.error ?? "Something went wrong." });
      after?.();
      router.refresh();
    });
  }

  function addDraft(id: string) {
    setDraft((d) => (d.some((x) => x.id === id) ? d.map((x) => (x.id === id ? { ...x, qty: x.qty + 1 } : x)) : [...d, { id, qty: 1, note: "" }]));
    if (query) setQuery("");
  }

  function beep(ok: boolean) {
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      const osc = ctx.createOscillator();
      osc.frequency.value = ok ? 1000 : 250;
      osc.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + (ok ? 0.08 : 0.25));
      setTimeout(() => ctx.close(), 400);
    } catch {
      /* no sound is fine */
    }
  }

  /**
   * A scanned barcode / SKU adds one of that item straight to the order.
   * Items that need the kitchen or bar still go to the draft so notes can be added.
   * Quick repeated scans are batched into one request.
   */
  function scan(raw: string) {
    const code = raw.trim().toLowerCase();
    if (!code) return false;
    const item = menu.find((m) => (m.barcode && m.barcode.toLowerCase() === code) || (m.sku && m.sku.toLowerCase() === code));
    if (!item) {
      beep(false);
      setLastScan({ ok: false, text: `No item with code ${raw.trim()}` });
      return false;
    }
    beep(true);
    setLastScan({ ok: true, text: `${item.label} · ${formatPrice(item.price)}` });
    if (item.station) {
      addDraft(item.id);
      return true;
    }
    scanQueue.current.set(item.id, (scanQueue.current.get(item.id) ?? 0) + 1);
    if (scanTimer.current) clearTimeout(scanTimer.current);
    scanTimer.current = setTimeout(() => {
      const lines = [...scanQueue.current.entries()].map(([variantId, quantity]) => ({ variantId, quantity }));
      scanQueue.current.clear();
      run(() => addItems(order.id, lines));
    }, 400);
    return true;
  }

  function send() {
    run(() => addItems(order.id, draft.map((d) => ({ variantId: d.id, quantity: d.qty, note: d.note || undefined }))), () => setDraft([]));
  }

  function startPay() {
    setPays([{ method: "cash", amount: String(order.total), reference: "", currency: "MVR" }]);
    setDiscount("");
    setPaying(true);
  }

  function confirmPay() {
    run(
      () => closeOrder(order.id, discountNum, pays.filter((p) => Number(p.amount) > 0).map((p) => (p.method === "points" ? { method: p.method, points: Math.floor(Number(p.amount)) } : p.currency !== "MVR" ? { method: p.method, currency: p.currency, foreignAmount: Number(p.amount), reference: p.reference || undefined } : { method: p.method, amount: Number(p.amount), reference: p.reference || undefined }))),
      () => router.push(`/pos/receipt/${order.id}?auto=1`),
    );
  }

  const title = `${ORDER_TYPE_LABEL[order.type]}${order.tableName ? ` · ${order.tableName}` : ""}${order.guest ? ` · ${order.guest}` : ""}`;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">{title}</h1>
          <p className="text-sm text-zinc-500">
            {order.outletName} · {order.orderNo}
            {order.firstSentAt && open && <> · seated <Elapsed since={order.firstSentAt} warnAfter={45} alertAfter={90} /></>}
            {!open && <> · {order.status}</>}
          </p>
        </div>
        <div className="flex gap-2">
          {!open && order.status === "closed" && (
            <a href={`/pos/receipt/${order.id}`} target="_blank" rel="noreferrer" className="btn-primary"><Printer className="size-4" /> Print receipt</a>
          )}
          <Link href={`/pos?outlet=${order.outletSlug}`} className="btn-outline"><ArrowLeft className="size-4" /> Tables</Link>
        </div>
      </div>

      <OrderExtras {...extras} open={open} />

      {msg && <p className={cn("mt-3 rounded-lg p-3 text-sm", msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700")}>{msg.text}</p>}

      <div className={cn("mt-4 grid gap-4", open ? "lg:grid-cols-[1fr_24rem]" : "max-w-2xl")}>
        {open && (
          <section className="card p-3 sm:p-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
              <input
                className="input min-h-12 pl-9 text-base"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && query.trim() && scan(query)) setQuery("");
                }}
                placeholder="Search menu or scan barcode"
                autoFocus
              />
            </div>
            {(lastScan || cameraScanSupported()) && (
              <div className="mt-2 flex items-center gap-2 text-sm">
                {cameraScanSupported() && (
                  <button type="button" className="btn-outline" onClick={() => setCamera(true)}><Camera className="size-4" /> Scan with camera</button>
                )}
                {lastScan && <span className={lastScan.ok ? "text-emerald-700" : "font-semibold text-red-600"}>{lastScan.ok ? "Added: " : ""}{lastScan.text}</span>}
              </div>
            )}
            {!query && (
              <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                {categories.map((c) => (
                  <button key={c} type="button" onClick={() => setCategory(c)} className={cn("shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium", category === c ? "border-zinc-900 bg-zinc-900 text-white" : "hover:bg-zinc-100")}>
                    {c}
                  </button>
                ))}
              </div>
            )}
            <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
              {shown.map((m) => (
                <li key={m.id}>
                  <button type="button" onClick={() => addDraft(m.id)} className="flex min-h-20 w-full flex-col justify-between rounded-lg border p-2.5 text-left hover:bg-zinc-50 active:bg-zinc-100">
                    <span className="text-sm font-medium leading-tight">{m.label}</span>
                    <span className="mt-1 flex items-center justify-between text-xs text-zinc-500">
                      <span className="font-semibold text-zinc-900">{formatPrice(m.price)}</span>
                      <span>{m.ready !== null ? `${m.ready} ready` : m.station === "kitchen" ? "Kitchen" : m.station === "bar" ? "Bar" : m.stock !== null ? `${m.stock} left` : ""}</span>
                    </span>
                  </button>
                </li>
              ))}
              {shown.length === 0 && <li className="col-span-full py-8 text-center text-sm text-zinc-500">{menu.length === 0 ? "No items at this outlet yet." : "Nothing found."}</li>}
            </ul>
          </section>
        )}

        <section className="space-y-3">
          {open && draft.length > 0 && (
            <div className="card border-zinc-900 p-3">
              <h2 className="text-sm font-semibold">To send ({draft.reduce((n, d) => n + d.qty, 0)})</h2>
              <ul className="mt-2 space-y-2">
                {draft.map((d) => (
                  <li key={d.id} className="text-sm">
                    <div className="flex items-center gap-2">
                      <span className="flex-1 font-medium">{byId.get(d.id)?.label}</span>
                      <button type="button" aria-label="Less" className="btn-outline size-9 !p-0" onClick={() => setDraft((x) => x.flatMap((y) => (y.id === d.id ? (y.qty > 1 ? [{ ...y, qty: y.qty - 1 }] : []) : [y])))}><Minus className="size-4" /></button>
                      <span className="w-6 text-center font-semibold">{d.qty}</span>
                      <button type="button" aria-label="More" className="btn-outline size-9 !p-0" onClick={() => setDraft((x) => x.map((y) => (y.id === d.id ? { ...y, qty: Math.min(y.qty + 1, 999) } : y)))}><Plus className="size-4" /></button>
                    </div>
                    <input className="input mt-1 h-8 text-xs" placeholder="Note (no onion, extra hot…)" maxLength={200} value={d.note} onChange={(e) => setDraft((x) => x.map((y) => (y.id === d.id ? { ...y, note: e.target.value } : y)))} />
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex gap-2">
                <button type="button" className="btn-primary min-h-12 flex-1 text-base" disabled={pending} onClick={send}>
                  <Send className="size-4" /> Send · {formatPrice(draftTotal)}
                </button>
                <button type="button" className="btn-outline min-h-12" onClick={() => setDraft([])}>Clear</button>
              </div>
            </div>
          )}

          <div className="card p-3">
            <h2 className="text-sm font-semibold">Order</h2>
            {lines.length === 0 ? (
              <p className="py-4 text-center text-sm text-zinc-500">Nothing ordered yet.</p>
            ) : (
              <ul className="mt-2 divide-y">
                {lines.map((l) => (
                  <li key={l.id} className="py-2 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className={cn("font-medium", l.status === "void" && "line-through text-zinc-400")}>{l.quantity} × {l.name}</span>
                        {l.note && <span className="block text-xs text-zinc-500">{l.note}</span>}
                      </div>
                      <span className={cn("shrink-0", l.status === "void" && "line-through text-zinc-400")}>{formatPrice(l.unit_price * l.quantity)}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", STATUS_STYLE[l.status])}>
                        {ITEM_STATUS_LABEL[l.status]}{l.station ? ` · ${l.station}` : ""}
                      </span>
                      {open && l.status === "ready" && (
                        <button type="button" disabled={pending} className="btn-primary h-8 px-3 text-xs" onClick={() => run(() => setItemStatus(l.id, "served"))}><Check className="size-3.5" /> Mark served</button>
                      )}
                      {open && l.status !== "void" && (
                        <button
                          type="button"
                          disabled={pending}
                          aria-label="Void item"
                          className="ml-auto text-zinc-400 hover:text-red-600"
                          onClick={() => {
                            if (l.status === "served" && !order.canManage) return setMsg({ ok: false, text: "A manager needs to remove an item that was already served." });
                            if (window.confirm(`Remove ${l.name}?`)) run(() => voidItem(l.id, "Removed at POS"));
                          }}
                        >
                          <Trash2 className="size-4" />
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <dl className="mt-3 space-y-1 border-t pt-3 text-sm">
              <div className="flex justify-between"><dt>Subtotal</dt><dd>{formatPrice(order.subtotal)}</dd></div>
              {order.discount > 0 && <div className="flex justify-between"><dt>Discount</dt><dd>−{formatPrice(order.discount)}</dd></div>}
              {order.type === "dine_in" && order.serviceChargePct > 0 && (
                <div className="flex justify-between"><dt>Service charge {order.serviceChargePct}%</dt><dd>{formatPrice(order.serviceCharge)}</dd></div>
              )}
              <div className="flex justify-between text-lg font-bold"><dt>Total</dt><dd>{formatPrice(order.total)}</dd></div>
            </dl>
            {open && (
              <div className="mt-3 flex gap-2">
                <button type="button" className="btn-primary min-h-12 flex-1 text-base" disabled={pending || live.length === 0} onClick={startPay}>Pay · {formatPrice(order.total)}</button>
                <button
                  type="button"
                  className="btn-outline min-h-12"
                  disabled={pending || (live.length > 0 && !order.canManage)}
                  title={live.length > 0 && !order.canManage ? "A manager cancels orders that have items" : "Cancel order"}
                  onClick={() => window.confirm("Cancel this whole order?") && run(() => cancelOrder(order.id, "Cancelled at POS"), () => router.push(`/pos?outlet=${order.outletSlug}`))}
                >
                  <X className="size-4" /> Cancel
                </button>
              </div>
            )}
          </div>
        </section>
      </div>

      {camera && <CameraScanner onCode={(c) => scan(c)} onClose={() => setCamera(false)} />}

      {paying && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true">
          <div className="max-h-dvh w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 sm:rounded-2xl">
            <h2 className="text-lg font-bold">Take payment</h2>
            {unserved > 0 && <p className="mt-2 rounded-lg bg-amber-50 p-2 text-sm text-amber-800">{unserved} item{unserved > 1 ? "s are" : " is"} not marked served yet.</p>}
            {order.canManage && (
              <label className="mt-3 block">
                <span className="label">Discount (amount)</span>
                <input className="input" inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="0" />
              </label>
            )}
            <dl className="mt-3 space-y-1 text-sm">
              <div className="flex justify-between"><dt>Subtotal</dt><dd>{formatPrice(order.subtotal)}</dd></div>
              {scNow > 0 && <div className="flex justify-between"><dt>Service charge</dt><dd>{formatPrice(scNow)}</dd></div>}
              <div className="flex justify-between text-xl font-bold"><dt>To pay</dt><dd>{formatPrice(totalNow)}</dd></div>
            </dl>

            <div className="mt-4 space-y-3">
              {pays.map((p, i) => (
                <div key={i} className="rounded-lg border p-3">
                  <div className="flex gap-2">
                    {(["cash", "card", "transfer", "gift_card", ...(extras.customer && extras.pointValue > 0 ? ["points" as const] : [])] as const).map((m) => (
                      <button key={m} type="button" onClick={() => setPays((x) => x.map((y, j) => (j === i ? { ...y, method: m, currency: m === "cash" ? y.currency : "MVR" } : y)))} className={cn("flex-1 rounded-lg border py-2 text-sm font-medium capitalize", p.method === m ? "border-zinc-900 bg-zinc-900 text-white" : "hover:bg-zinc-100")}>
                        {m === "gift_card" ? "gift card" : m}
                      </button>
                    ))}
                  </div>
                  <div className="mt-2 flex gap-2">
                    <input className="input flex-1" inputMode="decimal" placeholder={p.method === "points" ? `Points (you have ${extras.customer?.points ?? 0})` : "Amount"} value={p.amount} onChange={(e) => setPays((x) => x.map((y, j) => (j === i ? { ...y, amount: e.target.value.replace(/[^0-9.]/g, "") } : y)))} />
                    {pays.length > 1 && <button type="button" className="btn-outline" onClick={() => setPays((x) => x.filter((_, j) => j !== i))}><Trash2 className="size-4" /></button>}
                  </div>
                  {p.method === "points" && <p className="mt-2 text-sm text-zinc-600">1 point = {formatPrice(extras.pointValue)} → {formatPrice(mvrOf(p))}</p>}
                  {p.method === "cash" && rates.length > 0 && (
                    <div className="mt-2 flex items-center gap-2 text-sm">
                      <select className="input w-28" value={p.currency} onChange={(e) => setPays((x) => x.map((y, j) => (j === i ? { ...y, currency: e.target.value } : y)))}>
                        <option value="MVR">MVR</option>
                        {rates.map((r) => <option key={r.code} value={r.code}>{r.code}</option>)}
                      </select>
                      {p.currency !== "MVR" && <span className="text-zinc-600">× {rateOf(p.currency)} = {formatPrice(mvrOf(p))}</span>}
                    </div>
                  )}
                  {p.method !== "cash" && p.method !== "points" && (
                    <input className="input mt-2" placeholder={p.method === "card" ? "Card approval / reference no." : p.method === "gift_card" ? "Gift card code" : "Transfer reference no."} value={p.reference} maxLength={80} onChange={(e) => setPays((x) => x.map((y, j) => (j === i ? { ...y, reference: e.target.value } : y)))} />
                  )}
                </div>
              ))}
              <button type="button" className="btn-outline w-full" onClick={() => setPays((x) => [...x, { method: "card", amount: String(Math.max(totalNow - paidSum, 0).toFixed(2)), reference: "", currency: "MVR" }])}>
                <Plus className="size-4" /> Split with another payment
              </button>
            </div>

            <p className={cn("mt-3 text-sm", paidSum < totalNow ? "text-red-600" : "text-emerald-700")}>
              {paidSum < totalNow ? `Still to pay ${formatPrice(totalNow - paidSum)}` : paidSum > totalNow ? `Change ${formatPrice(paidSum - totalNow)}` : "Paid in full"}
            </p>
            <div className="mt-4 flex gap-2">
              <button type="button" className="btn-primary min-h-12 flex-1 text-base" disabled={pending || paidSum < totalNow} onClick={confirmPay}>Confirm payment</button>
              <button type="button" className="btn-outline min-h-12" onClick={() => setPaying(false)}>Back</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
