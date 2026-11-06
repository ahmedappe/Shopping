import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCatalogEditor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatPrice } from "@/lib/utils";
import { ORDER_TYPE_LABEL } from "@/lib/pos-labels";
import { PrintControls } from "./print-controls";

export const metadata: Metadata = { title: "Receipt", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function ReceiptPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ auto?: string }> }) {
  await requireCatalogEditor();
  const { id } = await params;
  const { auto } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();

  const [{ data: o }, { data: items }, { data: pays }] = await Promise.all([
    supabase
      .from("pos_orders")
      .select("order_no, order_type, status, guest_name, opened_at, closed_at, subtotal, discount, service_charge, total, paid_total, change_given, outlet:outlets(name, slug, service_charge_pct, receipt_header, receipt_footer, gst_number, gst_sector), table:dining_tables(name)")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("pos_order_items").select("name, unit_price, quantity, status, gst_pct, variant:product_variants(product:products(gst_taxable))").eq("order_id", id).neq("status", "void").order("created_at"),
    supabase.from("pos_payments").select("method, amount, reference, currency, foreign_amount").eq("order_id", id).order("created_at"),
  ]);
  if (!o) notFound();

  const outlet = o.outlet as unknown as { name: string; slug: string; service_charge_pct: number; receipt_header: string | null; receipt_footer: string | null; gst_number: string | null; gst_sector: "general" | "tourism" };
  const table = o.table as unknown as { name: string } | null;

  // GST included in the price, per rate. Discount and service charge are spread over the items pro rata.
  const sectorRate = outlet.gst_sector === "tourism" ? 17 : 8;
  const sub = Number(o.subtotal);
  const k = sub > 0 ? Number(o.total) / sub : 1;
  const gstByRate = new Map<number, number>();
  for (const i of (items ?? []) as unknown as { unit_price: number; quantity: number; gst_pct: number | null; variant: { product: { gst_taxable: boolean } | null } | null }[]) {
    const taxable = i.variant?.product?.gst_taxable ?? true;
    const rate = i.gst_pct !== null && i.gst_pct !== undefined ? Number(i.gst_pct) : taxable ? sectorRate : 0;
    if (rate <= 0) continue;
    const gross = Number(i.unit_price) * Number(i.quantity) * k;
    gstByRate.set(rate, (gstByRate.get(rate) ?? 0) + (gross * rate) / (100 + rate));
  }
  const gstTotal = [...gstByRate.values()].reduce((a, b) => a + b, 0);

  return (
    <main className="mx-auto min-h-dvh max-w-sm bg-white p-4 print:max-w-none print:p-0">
      <PrintControls auto={auto === "1" && o.status === "closed"} back={`/pos?outlet=${outlet.slug}`} />
      <div className="receipt mx-auto w-[72mm] font-mono text-[12px] leading-snug text-black">
        <div className="text-center">
          <p className="text-base font-bold">{outlet.name}</p>
          {outlet.gst_number && <p>GST TIN: {outlet.gst_number}</p>}
          {outlet.gst_number && <p className="font-bold">TAX INVOICE</p>}
          {outlet.receipt_header && <p className="whitespace-pre-line">{outlet.receipt_header}</p>}
        </div>
        <hr className="my-2 border-dashed border-black" />
        <p>Receipt: {o.order_no}</p>
        <p>{ORDER_TYPE_LABEL[o.order_type as keyof typeof ORDER_TYPE_LABEL]}{table ? ` · Table ${table.name}` : ""}{o.guest_name ? ` · ${o.guest_name}` : ""}</p>
        <p>{formatDate((o.closed_at as string | null) ?? (o.opened_at as string), true)}</p>
        {o.status !== "closed" && <p className="font-bold">*** {String(o.status).toUpperCase()} — NOT PAID ***</p>}
        <hr className="my-2 border-dashed border-black" />
        <table className="w-full">
          <tbody>
            {(items ?? []).map((i, n) => (
              <tr key={n} className="align-top">
                <td className="pr-1">{i.quantity} × {i.name}</td>
                <td className="text-right">{formatPrice(Number(i.unit_price) * Number(i.quantity))}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <hr className="my-2 border-dashed border-black" />
        <div className="space-y-0.5">
          <Row l="Subtotal" r={formatPrice(o.subtotal)} />
          {Number(o.discount) > 0 && <Row l="Discount" r={`-${formatPrice(o.discount)}`} />}
          {Number(o.service_charge) > 0 && <Row l={`Service charge ${outlet.service_charge_pct}%`} r={formatPrice(o.service_charge)} />}
          <Row l="TOTAL" r={formatPrice(o.total)} bold />
          {[...gstByRate.entries()].sort((a, b) => a[0] - b[0]).map(([rate, amt]) => (
            <Row key={rate} l={`incl. GST ${rate}%`} r={formatPrice(Math.round(amt * 100) / 100)} />
          ))}
          {gstByRate.size > 1 && <Row l="Total GST" r={formatPrice(Math.round(gstTotal * 100) / 100)} />}
        </div>
        {(pays ?? []).length > 0 && (
          <>
            <hr className="my-2 border-dashed border-black" />
            {(pays ?? []).map((p, n) => (
              <Row key={n} l={`${String(p.method).replace("_", " ").toUpperCase()}${p.currency && p.currency !== "MVR" ? ` ${Number(p.foreign_amount)} ${p.currency}` : ""}${p.reference ? ` (${p.method === "gift_card" ? `…${String(p.reference).slice(-4)}` : p.reference})` : ""}`} r={formatPrice(p.amount)} />
            ))}
            {Number(o.change_given) > 0 && <Row l="Change" r={formatPrice(o.change_given)} />}
          </>
        )}
        <hr className="my-2 border-dashed border-black" />
        <p className="text-center">{outlet.receipt_footer || "Thank you!"}</p>
      </div>
      <p className="mt-6 text-center text-xs text-zinc-400 print:hidden">
        <Link href={`/pos/order/${id}`} className="underline">Back to order</Link>
      </p>
    </main>
  );
}

function Row({ l, r, bold }: { l: string; r: string; bold?: boolean }) {
  return (
    <p className={`flex justify-between gap-2 ${bold ? "text-sm font-bold" : ""}`}>
      <span>{l}</span>
      <span>{r}</span>
    </p>
  );
}
