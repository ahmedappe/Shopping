import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireCatalogEditor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { variantLabel } from "@/lib/utils";
import { AutoRefresh } from "@/components/pos/auto-refresh";
import { OrderScreen, type MenuItem, type OrderData, type OrderLine } from "./order-screen";

export const metadata: Metadata = { title: "POS order", robots: { index: false } };
export const dynamic = "force-dynamic";

type OvRow = {
  variant_id: string;
  price: number;
  station: "kitchen" | "bar" | null;
  stock: number;
  made_in_advance: boolean;
  ready_qty: number;
  variant: {
    option1: string | null;
    option2: string | null;
    sku: string | null;
    barcode: string | null;
    product: { name: string; category: { name: string } | null } | null;
  } | null;
};

export default async function PosOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireCatalogEditor();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();

  const { data: order } = await supabase
    .from("pos_orders")
    .select("id, order_no, outlet_id, table_id, order_type, status, guest_name, opened_at, first_sent_at, subtotal, discount, service_charge, total, customer_id, delivery_by, delivery_status, delivery_address, outlet:outlets(name, slug, service_charge_pct, company_id, loyalty_earn_per_100, loyalty_point_value), table:dining_tables(name)")
    .eq("id", id)
    .maybeSingle();
  if (!order) notFound();

  const [{ data: items }, { data: menuRows }] = await Promise.all([
    supabase.from("pos_order_items").select("id, name, unit_price, quantity, note, station, status, created_at").eq("order_id", id).order("created_at"),
    order.status === "open"
      ? supabase
          .from("outlet_variants")
          .select("variant_id, price, station, stock, made_in_advance, ready_qty, variant:product_variants!inner(option1, option2, sku, barcode, product:products!inner(name, category:categories(name)))")
          .eq("outlet_id", order.outlet_id)
          .eq("is_active", true)
          .limit(2000)
      : Promise.resolve({ data: [] }),
  ]);

  const menu: MenuItem[] = ((menuRows ?? []) as unknown as OvRow[])
    .filter((r) => r.variant?.product)
    .map((r) => ({
      id: r.variant_id,
      label: `${r.variant!.product!.name}${variantLabel(r.variant!) ? ` · ${variantLabel(r.variant!)}` : ""}`,
      sku: r.variant!.sku,
      barcode: r.variant!.barcode,
      price: Number(r.price),
      category: r.variant!.product!.category?.name ?? "Other",
      station: r.station,
      stock: r.station ? null : r.stock,
      ready: r.made_in_advance ? r.ready_qty : null,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const outlet = order.outlet as unknown as { name: string; slug: string; service_charge_pct: number; company_id: string | null; loyalty_earn_per_100: number; loyalty_point_value: number } | null;
  const { data: rateRows } = outlet?.company_id
    ? await supabase.from("currency_rates").select("code, rate_to_mvr").eq("company_id", outlet.company_id).order("code")
    : { data: [] };
  const rates = (rateRows ?? []).map((r) => ({ code: r.code as string, rate: Number(r.rate_to_mvr) }));
  const [{ data: custRow }, { data: staffRows }] = await Promise.all([
    order.customer_id
      ? supabase.from("outlet_customers").select("id, name, phone, points_balance, referral_code, credit_limit, credit_balance").eq("id", order.customer_id as string).maybeSingle()
      : Promise.resolve({ data: null }),
    order.order_type === "delivery" ? supabase.rpc("outlet_staff", { p_outlet: order.outlet_id as string }) : Promise.resolve({ data: [] }),
  ]);
  const customer = custRow
    ? { id: custRow.id as string, name: custRow.name as string, phone: custRow.phone as string, points: Number(custRow.points_balance), referralCode: custRow.referral_code as string, creditLimit: Number(custRow.credit_limit), creditBalance: Number(custRow.credit_balance) }
    : null;
  const staff = ((staffRows ?? []) as { user_id: string; name: string }[]).map((s) => ({ id: s.user_id, name: s.name }));
  const table = order.table as unknown as { name: string } | null;

  const data: OrderData = {
    id: order.id as string,
    orderNo: order.order_no as string,
    outletSlug: outlet?.slug ?? "",
    outletName: outlet?.name ?? "",
    tableName: table?.name ?? null,
    type: order.order_type as OrderData["type"],
    status: order.status as OrderData["status"],
    guest: (order.guest_name as string | null) ?? null,
    openedAt: order.opened_at as string,
    firstSentAt: (order.first_sent_at as string | null) ?? null,
    subtotal: Number(order.subtotal),
    discount: Number(order.discount),
    serviceCharge: Number(order.service_charge),
    serviceChargePct: Number(outlet?.service_charge_pct ?? 0),
    total: Number(order.total),
    canManage: user.canManageStore,
  };

  return (
    <main className="mx-auto min-h-dvh max-w-7xl p-3 sm:p-5">
      {data.status === "open" && <AutoRefresh seconds={8} />}
      <OrderScreen
        rates={rates}
        extras={{
          orderId: data.id,
          outletId: order.outlet_id as string,
          customer,
          pointValue: Number(outlet?.loyalty_point_value ?? 0),
          loyaltyOn: Number(outlet?.loyalty_earn_per_100 ?? 0) > 0 || Number(outlet?.loyalty_point_value ?? 0) > 0,
          isDelivery: data.type === "delivery",
          delivery: { by: (order.delivery_by as string | null) ?? null, status: (order.delivery_status as "assigned" | "out" | "delivered" | null) ?? null, address: (order.delivery_address as string | null) ?? "" },
          staff,
        }}
        order={data} lines={(items ?? []) as unknown as OrderLine[]} menu={menu} />
    </main>
  );
}
