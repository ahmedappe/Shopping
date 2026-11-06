"use client";

import Link from "next/link";
import { Download } from "lucide-react";
import { formatPrice } from "@/lib/utils";

export type Report = {
  orders: number; subtotal: number; discount: number; service_charge: number; total: number; change_given: number;
  gst_pct: number; gst: number; gst_by_rate: { rate: number; gross: number; gst: number }[]; cancelled: number; voided_items: number; credit_sales: number;
  by_day: { day: string; orders: number; total: number }[];
  by_type: { type: string; orders: number; total: number }[];
  by_method: { method: string; currency: string; amount: number }[];
  top_items: { name: string; qty: number; revenue: number }[];
  drawers: { opened_at: string; expected: number; counted: number }[];
};

const TYPE: Record<string, string> = { dine_in: "Dine in", take_away: "Take away", delivery: "Delivery" };
const METHOD: Record<string, string> = { cash: "Cash", card: "Card", transfer: "Bank transfer", gift_card: "Gift card", points: "Points", credit: "On account" };

function csvCell(v: string | number) {
  const s = String(v);
  return /^[=+\-@]/.test(s) || /[",\n]/.test(s) ? `"${(/^[=+\-@]/.test(s) ? "'" + s : s).replace(/"/g, '""')}"` : s;
}

export function ReportView({ outletName, from, to, report: r }: { outletName: string; from: string; to: string; report: Report }) {
  const cashNet = (r.by_method.find((m) => m.method === "cash" && m.currency === "MVR")?.amount ?? 0);

  function download() {
    const rows: (string | number)[][] = [
      [`Sales report - ${outletName}`, from, to],
      [],
      ["Orders", r.orders],
      ["Subtotal", r.subtotal],
      ["Discount", r.discount],
      ["Service charge", r.service_charge],
      ["Total", r.total],
      ["GST included", r.gst],
      ...r.gst_by_rate.map((g) => [`  at ${g.rate}%: sales / GST`, g.gross, g.gst]),
      [],
      ["Day", "Orders", "Total"],
      ...r.by_day.map((d) => [d.day, d.orders, d.total]),
      [],
      ["Payment method", "Currency", "Amount"],
      ...r.by_method.map((m) => [METHOD[m.method] ?? m.method, m.currency, m.amount]),
      [],
      ["Item", "Qty", "Revenue"],
      ...r.top_items.map((i) => [i.name, i.qty, i.revenue]),
    ];
    const blob = new Blob(["﻿" + rows.map((row) => row.map(csvCell).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `sales-${outletName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${from}-to-${to}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const Stat = ({ label, value }: { label: string; value: string }) => (
    <div className="card p-3"><p className="text-xs text-zinc-500">{label}</p><p className="text-xl font-bold">{value}</p></div>
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Total sales" value={formatPrice(r.total)} />
        <Stat label="Orders" value={String(r.orders)} />
        <Stat label="Average order" value={formatPrice(r.orders ? r.total / r.orders : 0)} />
        <Stat label="Discounts" value={formatPrice(r.discount)} />
        <Stat label="Service charge" value={formatPrice(r.service_charge)} />
        <Stat label="GST (in prices)" value={formatPrice(r.gst)} />
        <Stat label="On account" value={formatPrice(r.credit_sales)} />
        <Stat label="Cancelled / voided" value={`${r.cancelled} / ${r.voided_items}`} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn-outline" onClick={download}><Download className="size-4" /> Download CSV</button>
        <Link href="/admin/gst" className="text-sm underline">Set GST rates</Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card p-4">
          <h2 className="font-semibold">By day</h2>
          <table className="mt-2 w-full text-sm"><tbody>
            {r.by_day.map((d) => <tr key={d.day}><td className="py-1">{d.day}</td><td className="text-right">{d.orders} orders</td><td className="text-right font-medium">{formatPrice(d.total)}</td></tr>)}
            {r.by_day.length === 0 && <tr><td className="py-1 text-zinc-500">No sales in this range.</td></tr>}
          </tbody></table>
        </section>
        <section className="card p-4">
          <h2 className="font-semibold">Payments received</h2>
          <table className="mt-2 w-full text-sm"><tbody>
            {r.by_method.map((m, i) => <tr key={i}><td className="py-1">{METHOD[m.method] ?? m.method}{m.currency !== "MVR" ? ` (${m.currency} converted)` : ""}</td><td className="text-right font-medium">{formatPrice(m.amount)}</td></tr>)}
          </tbody></table>
          <p className="mt-2 text-xs text-zinc-500">Cash is before change given ({formatPrice(r.change_given)} in change). Cash kept: {formatPrice(cashNet - r.change_given)} (MVR cash only).</p>
          <h3 className="mt-4 text-sm font-semibold">By order type</h3>
          <table className="mt-1 w-full text-sm"><tbody>
            {r.by_type.map((t) => <tr key={t.type}><td className="py-1">{TYPE[t.type] ?? t.type}</td><td className="text-right">{t.orders}</td><td className="text-right font-medium">{formatPrice(t.total)}</td></tr>)}
          </tbody></table>
        </section>
        <section className="card p-4">
          <h2 className="font-semibold">GST by rate</h2>
          <table className="mt-2 w-full text-sm"><tbody>
            {r.gst_by_rate.map((g) => <tr key={g.rate}><td className="py-1">{g.rate}%</td><td className="text-right">sales {formatPrice(g.gross)}</td><td className="text-right font-medium">GST {formatPrice(g.gst)}</td></tr>)}
            {r.gst_by_rate.length === 0 && <tr><td className="py-1 text-zinc-500">No sales in this range.</td></tr>}
          </tbody></table>
          <p className="mt-2 text-xs text-zinc-500">Discounts and service charge are shared across the items on each bill. Items sold before per-product rates were set use the outlet default.</p>
        </section>
        <section className="card p-4">
          <h2 className="font-semibold">Best sellers</h2>
          <table className="mt-2 w-full text-sm"><tbody>
            {r.top_items.map((i) => <tr key={i.name}><td className="py-1">{i.name}</td><td className="text-right">{i.qty}</td><td className="text-right font-medium">{formatPrice(i.revenue)}</td></tr>)}
            {r.top_items.length === 0 && <tr><td className="py-1 text-zinc-500">Nothing sold.</td></tr>}
          </tbody></table>
        </section>
        <section className="card p-4">
          <h2 className="font-semibold">Cash drawers closed</h2>
          <table className="mt-2 w-full text-sm"><tbody>
            {r.drawers.map((d, i) => {
              const diff = Number(d.counted) - Number(d.expected);
              return <tr key={i}><td className="py-1">{d.opened_at.slice(0, 10)}</td><td className="text-right">{formatPrice(d.counted)} of {formatPrice(d.expected)}</td><td className={`text-right font-medium ${diff === 0 ? "text-emerald-700" : "text-red-700"}`}>{diff === 0 ? "balanced" : diff > 0 ? `over ${formatPrice(diff)}` : `short ${formatPrice(-diff)}`}</td></tr>;
            })}
            {r.drawers.length === 0 && <tr><td className="py-1 text-zinc-500">None in this range.</td></tr>}
          </tbody></table>
        </section>
      </div>
    </div>
  );
}
