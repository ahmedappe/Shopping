import Link from "next/link";
import { AlertTriangle, Banknote, Clock, Package, ShoppingCart, Users } from "lucide-react";
import { requireManager } from "@/lib/auth";
import { getAdminOutlets, pickOutlet } from "@/lib/admin-outlets";
import { OutletFilter } from "@/components/admin/outlet-filter";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatPrice, variantLabel } from "@/lib/utils";
import { ORDER_STATUS_META, STORE } from "@/config/store";
import { StatusBadge } from "@/components/status-badge";
import type { Order, OrderStatus } from "@/lib/types";

type Stats = {
  revenue_total: number;
  revenue_30d: number;
  orders_total: number;
  orders_today: number;
  awaiting_review: number;
  customers: number;
  products_active: number;
  low_stock: number;
  status_counts: Partial<Record<OrderStatus, number>>;
  daily: { day: string; revenue: number; orders: number }[];
  top_products: { name: string; quantity: number; revenue: number }[];
};

export default async function AdminDashboard({ searchParams }: { searchParams: Promise<{ outlet?: string }> }) {
  const user = await requireManager();
  const params = await searchParams;
  const outlets = await getAdminOutlets(user);
  const { selected, ids } = pickOutlet(outlets, params.outlet);
  const supabase = await createClient();

  const [{ data: statsData, error }, { data: recent }, { data: lowStock }] = await Promise.all([
    supabase.rpc("admin_dashboard_stats", { p_outlet: selected?.id ?? null }),
    (() => {
      const q = supabase
        .from("orders")
        .select("id, order_number, customer_name, status, total, created_at, handover_method")
        .order("created_at", { ascending: false })
        .limit(8);
      return selected ? q.eq("outlet_id", selected.id) : q;
    })(),
    supabase
      .from("outlet_variants")
      .select("variant_id, outlet_id, stock, variant:product_variants!inner(id, option1, option2, product:products(id, name))")
      .in("outlet_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"])
      .eq("is_active", true)
      .lte("stock", STORE.lowStockThreshold)
      .order("stock")
      .limit(8),
  ]);

  if (error || !statsData) {
    return <p className="text-red-600">Could not load stats: {error?.message}</p>;
  }
  const s = statsData as Stats;
  const maxRevenue = Math.max(1, ...s.daily.map((d) => Number(d.revenue)));

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-zinc-500">{selected ? selected.name : "All outlets"}</p>
        </div>
        {s.awaiting_review > 0 && (
          <Link href="/admin/orders?status=slip_uploaded" className="btn-brand">
            Review {s.awaiting_review} payment slip{s.awaiting_review > 1 ? "s" : ""}
          </Link>
        )}
      </div>

      <OutletFilter outlets={outlets} selectedSlug={selected?.slug} basePath="/admin" />

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard icon={Banknote} label="Revenue (30 days)" value={formatPrice(s.revenue_30d)} hint={`${formatPrice(s.revenue_total)} all time`} />
        <StatCard icon={ShoppingCart} label="Orders" value={String(s.orders_total)} hint={`${s.orders_today} today`} />
        <StatCard icon={Clock} label="Awaiting review" value={String(s.awaiting_review)} hint="Slips to verify" highlight={s.awaiting_review > 0} />
        <StatCard icon={Users} label="Customers" value={String(s.customers)} hint={`${s.products_active} active products`} />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <section className="card p-5 xl:col-span-2">
          <h2 className="font-semibold">Revenue — last 14 days</h2>
          <p className="text-xs text-zinc-500">Approved & delivered orders</p>
          <div className="mt-6 flex h-48 items-end gap-1.5">
            {s.daily.map((d) => (
              <div key={d.day} className="group relative flex h-full flex-1 flex-col justify-end">
                <div
                  className="min-h-[2px] rounded-t bg-brand-600 transition-colors group-hover:bg-brand-800"
                  style={{ height: `${(Number(d.revenue) / maxRevenue) * 100}%` }}
                />
                <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 rounded bg-zinc-900 px-2 py-1 text-xs whitespace-nowrap text-white group-hover:block">
                  {formatDate(d.day)}: {formatPrice(d.revenue)} · {d.orders} orders
                </div>
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-between text-xs text-zinc-400">
            <span>{s.daily[0] && formatDate(s.daily[0].day)}</span>
            <span>Today</span>
          </div>
        </section>

        <section className="card p-5">
          <h2 className="font-semibold">Orders by status</h2>
          <ul className="mt-4 space-y-3">
            {(Object.keys(ORDER_STATUS_META) as OrderStatus[]).map((status) => (
              <li key={status}>
                <Link href={`/admin/orders?status=${status}`} className="flex items-center justify-between text-sm hover:underline">
                  <StatusBadge status={status} />
                  <span className="font-semibold">{s.status_counts[status] ?? 0}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <section className="card overflow-hidden xl:col-span-2">
          <div className="flex items-center justify-between p-5 pb-3">
            <h2 className="font-semibold">Recent orders</h2>
            <Link href="/admin/orders" className="text-sm text-brand-700 hover:underline">
              View all
            </Link>
          </div>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-zinc-100">
              {((recent ?? []) as Pick<Order, "id" | "order_number" | "customer_name" | "status" | "total" | "created_at" | "handover_method">[]).map((o) => (
                <tr key={o.id} className="hover:bg-zinc-50">
                  <td className="px-5 py-3">
                    <Link href={`/admin/orders/${o.id}`} className="font-medium hover:underline">
                      {o.order_number}
                    </Link>
                    <p className="text-xs text-zinc-500">{o.customer_name}</p>
                  </td>
                  <td className="px-2 py-3 text-zinc-500">{formatDate(o.created_at)}</td>
                  <td className="px-2 py-3"><StatusBadge status={o.status} handover={o.handover_method} /></td>
                  <td className="px-5 py-3 text-right font-medium">{formatPrice(o.total)}</td>
                </tr>
              ))}
              {(recent ?? []).length === 0 && (
                <tr><td className="px-5 py-6 text-center text-zinc-500">No orders yet</td></tr>
              )}
            </tbody>
          </table>
        </section>

        <div className="space-y-6">
          <section className="card p-5">
            <h2 className="font-semibold">Top products</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {s.top_products.map((p) => (
                <li key={p.name} className="flex justify-between gap-3">
                  <span className="truncate">{p.name}</span>
                  <span className="shrink-0 text-zinc-500">{p.quantity} sold</span>
                </li>
              ))}
              {s.top_products.length === 0 && <li className="text-zinc-500">No sales yet</li>}
            </ul>
          </section>

          <section className="card p-5">
            <h2 className="flex items-center gap-2 font-semibold">
              <AlertTriangle className="size-4 text-amber-500" /> Low stock ({s.low_stock})
            </h2>
            <ul className="mt-3 space-y-2 text-sm">
              {((lowStock ?? []) as unknown as {
                variant_id: string;
                outlet_id: string;
                stock: number;
                variant: { id: string; option1: string | null; option2: string | null; product: { id: string; name: string } | null } | null;
              }[]).map((v) => (
                <li key={`${v.outlet_id}-${v.variant_id}`} className="flex justify-between gap-3">
                  <Link href={`/admin/products/${v.variant?.product?.id}`} className="truncate hover:underline">
                    {v.variant?.product?.name}
                    {v.variant && variantLabel(v.variant) && <span className="text-zinc-500"> · {variantLabel(v.variant)}</span>}
                    {!selected && outlets.length > 1 && (
                      <span className="text-zinc-400"> · {outlets.find((o) => o.id === v.outlet_id)?.name}</span>
                    )}
                  </Link>
                  <span className={v.stock === 0 ? "font-semibold text-red-600" : "text-amber-600"}>{v.stock}</span>
                </li>
              ))}
              {(lowStock ?? []).length === 0 && <li className="text-zinc-500">All stocked up</li>}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  highlight,
}: {
  icon: typeof Package;
  label: string;
  value: string;
  hint?: string;
  highlight?: boolean;
}) {
  return (
    <div className={`card p-5 ${highlight ? "ring-2 ring-brand-500" : ""}`}>
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-500">{label}</p>
        <Icon className="size-4 text-zinc-400" />
      </div>
      <p className="mt-2 text-2xl font-bold tracking-tight">{value}</p>
      {hint && <p className="mt-1 text-xs text-zinc-500">{hint}</p>}
    </div>
  );
}
