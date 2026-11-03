import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { z } from "zod";
import { requireManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SLIP_BUCKET } from "@/lib/storage";
import { formatDate, formatPrice } from "@/lib/utils";
import { ORDER_STATUS_META } from "@/config/store";
import { StatusBadge } from "@/components/status-badge";
import { OrderItems } from "@/components/order-items";
import { StatusActions } from "./status-actions";
import type { Order, OrderHistory, OrderItem } from "@/lib/types";

export const metadata: Metadata = { title: "Order" };

export default async function AdminOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireManager();
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();

  const supabase = await createClient();
  const { data } = await supabase
    .from("orders")
    .select("*, order_items(*), order_status_history(id, from_status, to_status, note, created_at)")
    .eq("id", id)
    .order("created_at", { referencedTable: "order_status_history", ascending: false })
    .maybeSingle();
  if (!data) notFound();

  const order = data as Order & { order_items: OrderItem[]; order_status_history: OrderHistory[] };

  let slipUrl: string | null = null;
  if (order.slip_path) {
    const { data: signed } = await supabase.storage.from(SLIP_BUCKET).createSignedUrl(order.slip_path, 600);
    slipUrl = signed?.signedUrl ?? null;
  }

  return (
    <div className="max-w-6xl">
      <Link href="/admin/orders" className="inline-flex items-center gap-1.5 text-sm text-zinc-600 hover:text-zinc-900">
        <ArrowLeft className="size-4" /> Orders
      </Link>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Order {order.order_number}</h1>
          <p className="text-sm text-zinc-500">Placed {formatDate(order.created_at, true)}</p>
        </div>
        <div className="text-right">
          <StatusBadge status={order.status} handover={order.handover_method} className="text-sm" />
          {order.handover_method === "collection" && order.collection_location && (
            <p className="mt-1 text-sm text-zinc-600">Collected from {order.collection_location}</p>
          )}
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <section className="card p-5">
            <h2 className="font-semibold">Payment slip</h2>
            {slipUrl ? (
              <div className="mt-3">
                <a href={slipUrl} target="_blank" rel="noopener noreferrer" className="block">
                  {/* eslint-disable-next-line @next/next/no-img-element -- signed, short-lived URL */}
                  <img
                    src={slipUrl}
                    alt="Payment slip"
                    className="max-h-[520px] w-full rounded-lg border border-zinc-200 bg-zinc-50 object-contain"
                  />
                </a>
                <div className="mt-2 flex items-center justify-between text-xs text-zinc-500">
                  <span>{order.slip_uploaded_at && `Uploaded ${formatDate(order.slip_uploaded_at, true)}`}</span>
                  <a href={slipUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:underline">
                    Open full size <ExternalLink className="size-3" />
                  </a>
                </div>
                <p className="mt-3 rounded-lg bg-zinc-50 p-3 text-sm">
                  Expected amount: <strong>{formatPrice(order.total)}</strong> · Reference: <strong>{order.order_number}</strong>
                </p>
                <SlipCheckPanel order={order} />
              </div>
            ) : (
              <p className="mt-2 text-sm text-zinc-500">The customer hasn&apos;t uploaded a slip yet.</p>
            )}
          </section>

          <section className="card p-5">
            <h2 className="mb-2 font-semibold">Items</h2>
            <OrderItems order={order} items={order.order_items} />
          </section>
        </div>

        <aside className="space-y-6">
          <StatusActions orderId={order.id} status={order.status} isAdmin={user.isAdmin} />

          <section className="card p-5 text-sm">
            <h2 className="font-semibold">Customer</h2>
            <p className="mt-3 font-medium">{order.customer_name}</p>
            <p>
              <a href={`tel:${order.phone}`} className="text-brand-700 hover:underline">
                {order.phone}
              </a>
            </p>
            {order.email && (
              <p>
                <a href={`mailto:${order.email}`} className="text-brand-700 hover:underline">
                  {order.email}
                </a>
              </p>
            )}
            <p className="mt-3 whitespace-pre-line text-zinc-600">
              {order.address}
              {"\n"}
              {order.city}
            </p>
            {order.notes && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-amber-900">Note: {order.notes}</p>}
          </section>

          <section className="card p-5 text-sm">
            <h2 className="font-semibold">History</h2>
            <ol className="mt-3 space-y-3">
              {order.order_status_history.map((h) => (
                <li key={h.id} className="border-l-2 border-zinc-200 pl-3">
                  <p className="font-medium">{ORDER_STATUS_META[h.to_status].label}</p>
                  <p className="text-xs text-zinc-500">{formatDate(h.created_at, true)}</p>
                  {h.note && <p className="mt-1 text-zinc-600">{h.note}</p>}
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>
    </div>
  );
}

const CHECK_LABELS: [string, string][] = [
  ["looksLikeReceipt", "Looks like a bank receipt"],
  ["bankRecognised", "Bank recognised"],
  ["statusSuccess", "Shows success"],
  ["amountMatches", "Amount matches order total"],
  ["accountMatches", "Our account found"],
  ["dateOk", "Date plausible"],
  ["referenceFound", "Transaction reference read"],
  ["notDuplicate", "Not used on another order"],
];

/** Result of the automatic text check. Only a first filter, so the slip above still needs a human look. */
function SlipCheckPanel({ order }: { order: Order }) {
  if (!order.slip_verdict) return null;
  const checks = order.slip_checks?.checks ?? {};
  const warnings = order.slip_checks?.warnings ?? [];

  const tone =
    order.slip_verdict === "ok"
      ? "border-green-200 bg-green-50 text-green-900"
      : order.slip_verdict === "review"
        ? "border-amber-200 bg-amber-50 text-amber-900"
        : "border-zinc-200 bg-zinc-50 text-zinc-700";
  const title =
    order.slip_verdict === "ok"
      ? "Automatic check: nothing odd found"
      : order.slip_verdict === "review"
        ? "Automatic check: please look closely"
        : "Automatic check: not run (text could not be read)";

  return (
    <div className={`mt-3 rounded-lg border p-3 text-sm ${tone}`}>
      <p className="font-semibold">{title}</p>
      {warnings.length > 0 && (
        <ul className="mt-1 list-disc pl-5">
          {warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
      {order.slip_verdict !== "unchecked" && (
        <>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
            <dt className="opacity-70">Bank</dt>
            <dd>{order.slip_bank === "BML" ? "Bank of Maldives" : order.slip_bank === "MIB" ? "Maldives Islamic Bank" : "—"}</dd>
            <dt className="opacity-70">Reference</dt>
            <dd className="font-mono">{order.slip_reference ?? "—"}</dd>
            <dt className="opacity-70">Amount read</dt>
            <dd>{order.slip_amount != null ? formatPrice(order.slip_amount) : "—"}</dd>
            <dt className="opacity-70">Paid at</dt>
            <dd>{order.slip_paid_at ? formatDate(order.slip_paid_at, true) : "—"}</dd>
          </dl>
          <ul className="mt-2 grid gap-x-4 gap-y-0.5 text-xs sm:grid-cols-2">
            {CHECK_LABELS.map(([key, label]) => {
              const v = checks[key];
              return (
                <li key={key}>
                  {v === true ? "✓" : v === false ? "✗" : "?"} {label}
                </li>
              );
            })}
          </ul>
        </>
      )}
      <p className="mt-2 text-xs opacity-70">Text was read automatically and can be wrong. Always compare with the slip image.</p>
    </div>
  );
}
