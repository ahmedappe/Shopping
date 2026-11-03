import type { Metadata } from "next";
import Link from "next/link";
import { requireManager } from "@/lib/auth";
import { getAdminOutlets, pickOutlet } from "@/lib/admin-outlets";
import { OutletFilter } from "@/components/admin/outlet-filter";
import { createClient } from "@/lib/supabase/server";
import { ORDER_STATUS_META } from "@/config/store";
import { StatusBadge } from "@/components/status-badge";
import { Pagination } from "@/components/pagination";
import { cn, formatDate, formatPrice, sanitizeSearch } from "@/lib/utils";
import type { Order, OrderStatus } from "@/lib/types";

export const metadata: Metadata = { title: "Orders" };

const PAGE_SIZE = 25;
const STATUSES = Object.keys(ORDER_STATUS_META) as OrderStatus[];

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; page?: string; outlet?: string }>;
}) {
  const user = await requireManager();
  const params = await searchParams;
  const status = STATUSES.includes(params.status as OrderStatus) ? (params.status as OrderStatus) : undefined;
  const q = sanitizeSearch(params.q ?? "");
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);

  const outlets = await getAdminOutlets(user);
  const { selected } = pickOutlet(outlets, params.outlet);
  const outletName = new Map(outlets.map((o) => [o.id, o.name]));

  const supabase = await createClient();
  let query = supabase
    .from("orders")
    .select("id, order_number, outlet_id, customer_name, phone, city, status, total, created_at, slip_path, slip_verdict, handover_method", { count: "exact" })
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (status) query = query.eq("status", status);
  if (selected) query = query.eq("outlet_id", selected.id);
  if (q) {
    const p = `*${q.replace(/ /g, "*")}*`;
    query = query.or(`order_number.ilike.${p},customer_name.ilike.${p},phone.ilike.${p}`);
  }
  const { data, count } = await query;
  const orders = (data ?? []) as Pick<
    Order,
    "id" | "order_number" | "outlet_id" | "customer_name" | "phone" | "city" | "status" | "total" | "created_at" | "slip_path" | "slip_verdict" | "handover_method"
  >[];

  const tabHref = (s?: string) => {
    const sp = new URLSearchParams();
    if (s) sp.set("status", s);
    if (q) sp.set("q", q);
    if (selected) sp.set("outlet", selected.slug);
    return `/admin/orders${sp.size ? `?${sp}` : ""}`;
  };

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Orders</h1>

      <div className="mt-4">
        <OutletFilter outlets={outlets} selectedSlug={selected?.slug} basePath="/admin/orders" params={{ status, q: q || undefined }} />
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 overflow-x-auto">
          <Tab href={tabHref()} active={!status}>
            All
          </Tab>
          {STATUSES.map((s) => (
            <Tab key={s} href={tabHref(s)} active={status === s}>
              {ORDER_STATUS_META[s].label}
            </Tab>
          ))}
        </div>
        <form className="w-full sm:w-72">
          {status && <input type="hidden" name="status" value={status} />}
          {selected && <input type="hidden" name="outlet" value={selected.slug} />}
          <input name="q" type="search" defaultValue={q} placeholder="Order no., name or phone" className="input" />
        </form>
      </div>

      <div className="card mt-4 overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs font-medium text-zinc-500 uppercase">
            <tr>
              <th className="px-4 py-3">Order</th>
              <th className="px-4 py-3">Outlet</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {orders.map((o) => (
              <tr key={o.id} className="hover:bg-zinc-50">
                <td className="px-4 py-3">
                  <Link href={`/admin/orders/${o.id}`} className="font-medium text-brand-700 hover:underline">
                    {o.order_number}
                  </Link>
                </td>
                <td className="px-4 py-3 text-zinc-600">{o.outlet_id ? (outletName.get(o.outlet_id) ?? "—") : "No outlet"}</td>
                <td className="px-4 py-3">
                  <p>{o.customer_name}</p>
                  <p className="text-xs text-zinc-500">
                    {o.phone} · {o.city}
                  </p>
                </td>
                <td className="px-4 py-3 text-zinc-500">{formatDate(o.created_at, true)}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={o.status} handover={o.handover_method} />
                  {o.status === "slip_uploaded" && o.slip_verdict === "review" && (
                    <p className="mt-1 text-xs font-medium text-amber-700">⚠ Check slip</p>
                  )}
                </td>
                <td className="px-4 py-3 text-right font-medium">{formatPrice(o.total)}</td>
              </tr>
            ))}
            {orders.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-zinc-500">
                  No orders found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Pagination
        page={page}
        pageCount={Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE))}
        basePath="/admin/orders"
        params={{ status, q: q || undefined, outlet: selected?.slug }}
      />
    </div>
  );
}

function Tab({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={cn(
        "shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium",
        active ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-200",
      )}
    >
      {children}
    </Link>
  );
}
