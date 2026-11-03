import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireCatalogEditor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getAdminOutlets } from "@/lib/admin-outlets";
import { formatDate, variantLabel } from "@/lib/utils";
import { TransferForm, type VariantChoice } from "./transfer-form";
import { DecideButtons } from "./decide-buttons";

export const metadata: Metadata = { title: "Stock transfers" };

type Row = {
  id: string;
  from_outlet: string;
  from_location: string;
  to_outlet: string;
  to_location: string;
  quantity: number;
  note: string | null;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  decided_at: string | null;
  variant: { option1: string | null; option2: string | null; product: { name: string } | null } | null;
};

const STATUS_STYLE = {
  pending: "bg-amber-50 text-amber-800",
  approved: "bg-green-50 text-green-800",
  rejected: "bg-zinc-100 text-zinc-600",
} as const;

export default async function StockTransfersPage() {
  const user = await requireCatalogEditor();
  const outlets = await getAdminOutlets(user);
  const supabase = await createClient();

  // Staff may move stock to or from an outlet of their own company they don't work in: list the company's outlets.
  const companyIds = [...new Set(outlets.map((o) => o.company_id).filter(Boolean))] as string[];
  const { data: companyOutlets } = companyIds.length
    ? await supabase.from("outlets").select("id, name, slug, hostnames, bank_name, account_name, account_number, delivery_fee, free_delivery_threshold, is_active, sort_order, company_id").in("company_id", companyIds).order("sort_order")
    : { data: [] };
  const allOutlets = (companyOutlets ?? []) as unknown as typeof outlets;
  const outletName = new Map(allOutlets.map((o) => [o.id, o.name]));

  const [{ data: transfers }, { data: variantRows }] = await Promise.all([
    supabase
      .from("stock_transfers")
      .select("id, from_outlet, from_location, to_outlet, to_location, quantity, note, status, created_at, decided_at, variant:product_variants(option1, option2, product:products(name))")
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("product_variants")
      .select("id, option1, option2, product:products(name)")
      .order("product_id")
      .limit(2000),
  ]);

  const rows = (transfers ?? []) as unknown as Row[];
  const variants: VariantChoice[] = ((variantRows ?? []) as unknown as { id: string; option1: string | null; option2: string | null; product: { name: string } | null }[])
    .map((v) => ({ id: v.id, label: `${v.product?.name ?? "Item"}${variantLabel(v) ? ` · ${variantLabel(v)}` : ""}` }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const place = (outlet: string, loc: string) => `${outletName.get(outlet) ?? "Outlet"} ${loc}`;

  return (
    <div className="max-w-5xl">
      <Link href="/admin/stock" className="inline-flex items-center gap-1.5 text-sm text-zinc-600 hover:text-zinc-900">
        <ArrowLeft className="size-4" /> Stock
      </Link>
      <h1 className="mt-4 text-2xl font-bold tracking-tight">Stock transfers</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Move stock between outlets of the same company, or between an outlet&apos;s godown and shop. Stock only moves after a manager or admin approves.
      </p>

      <section className="card mt-6 p-5">
        <h2 className="font-semibold">Request a transfer</h2>
        <TransferForm outlets={allOutlets} variants={variants} />
      </section>

      <section className="card mt-6 overflow-x-auto">
        <table className="w-full min-w-[680px] text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs font-medium text-zinc-500 uppercase">
            <tr>
              <th className="px-4 py-3">Item</th>
              <th className="px-4 py-3">From → To</th>
              <th className="px-4 py-3 text-right">Qty</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {rows.map((t) => (
              <tr key={t.id}>
                <td className="px-4 py-3">
                  <p className="font-medium">
                    {t.variant?.product?.name}
                    {t.variant && variantLabel(t.variant) && <span className="text-zinc-500"> · {variantLabel(t.variant)}</span>}
                  </p>
                  <p className="text-xs text-zinc-500">{formatDate(t.created_at, true)}{t.note ? ` · ${t.note}` : ""}</p>
                </td>
                <td className="px-4 py-3">
                  {place(t.from_outlet, t.from_location)} → {place(t.to_outlet, t.to_location)}
                </td>
                <td className="px-4 py-3 text-right font-semibold">{t.quantity}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_STYLE[t.status]}`}>{t.status}</span>
                </td>
                <td className="px-4 py-3 text-right">{t.status === "pending" && user.canManageStore && <DecideButtons id={t.id} />}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-zinc-500">No transfers yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
