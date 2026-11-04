import type { Metadata } from "next";
import Link from "next/link";
import { requireManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getAdminOutlets } from "@/lib/admin-outlets";
import { STORE } from "@/config/store";
import type { Company, Outlet } from "@/lib/types";

export const metadata: Metadata = { title: "Outlets overview" };

/** Start of today in Maldives time (UTC+5), as an ISO string. */
function startOfTodayMv() {
  const now = new Date(Date.now() + 5 * 3600_000);
  const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - 5 * 3600_000;
  return new Date(midnight).toISOString();
}

async function statsFor(outletId: string, since: string) {
  const supabase = await createClient();
  const count = (q: PromiseLike<{ count: number | null }>) => q.then((r) => r.count ?? 0);
  const [today, awaiting, toDeliver, low] = await Promise.all([
    count(supabase.from("orders").select("id", { count: "exact", head: true }).eq("outlet_id", outletId).gte("created_at", since)),
    count(supabase.from("orders").select("id", { count: "exact", head: true }).eq("outlet_id", outletId).eq("status", "slip_uploaded")),
    count(supabase.from("orders").select("id", { count: "exact", head: true }).eq("outlet_id", outletId).eq("status", "approved")),
    count(
      supabase
        .from("outlet_variants")
        .select("variant_id", { count: "exact", head: true })
        .eq("outlet_id", outletId)
        .eq("is_active", true)
        .lte("stock", STORE.lowStockThreshold),
    ),
  ]);
  return { today, awaiting, toDeliver, low };
}

export default async function OutletsOverviewPage() {
  const user = await requireManager();
  const outlets = await getAdminOutlets(user);
  const supabase = await createClient();
  const { data: companyRows } = await supabase.from("companies").select("id, name, slug").order("sort_order");
  const companies = (companyRows ?? []) as Company[];
  const since = startOfTodayMv();

  const stats = new Map<string, Awaited<ReturnType<typeof statsFor>>>();
  await Promise.all(
    outlets.map(async (o) => {
      stats.set(o.id, await statsFor(o.id, since));
    }),
  );

  const groups: { title: string; outlets: Outlet[] }[] = companies
    .map((c) => ({ title: c.name, outlets: outlets.filter((o) => o.company_id === c.id) }))
    .filter((g) => g.outlets.length > 0);
  const loose = outlets.filter((o) => !o.company_id || !companies.some((c) => c.id === o.company_id));
  if (loose.length) groups.push({ title: "Other outlets", outlets: loose });

  const stat = (label: string, value: number, warn = false) => (
    <div>
      <p className={`text-2xl font-bold ${warn && value > 0 ? "text-amber-600" : ""}`}>{value}</p>
      <p className="text-xs text-zinc-500">{label}</p>
    </div>
  );

  return (
    <div className="max-w-5xl">
      <h1 className="text-2xl font-bold tracking-tight">Outlets overview</h1>
      <p className="mt-1 text-sm text-zinc-500">Every outlet at a glance. Click an outlet to open its orders, stock or settings.</p>

      {groups.map((g) => (
        <section key={g.title} className="mt-8">
          <h2 className="text-sm font-semibold tracking-wide text-zinc-500 uppercase">{g.title}</h2>
          <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {g.outlets.map((o) => {
              const s = stats.get(o.id)!;
              return (
                <div key={o.id} className="card p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-semibold">{o.name}</h3>
                      <p className="truncate text-xs text-zinc-500">{o.hostnames[0] ?? "No domain yet"}</p>
                    </div>
                    {!o.is_active && <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">Closed</span>}
                  </div>
                  <div className="mt-4 grid grid-cols-4 gap-2">
                    {stat("Orders today", s.today)}
                    {stat("To approve", s.awaiting, true)}
                    {stat("To deliver", s.toDeliver)}
                    {stat("Low stock", s.low, true)}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                    <Link className="text-brand-700 hover:underline" href={`/admin/orders?outlet=${o.slug}`}>Orders</Link>
                    <Link className="text-brand-700 hover:underline" href={`/admin/products?outlet=${o.slug}`}>Products</Link>
                    <Link className="text-brand-700 hover:underline" href={`/admin?outlet=${o.slug}`}>Dashboard</Link>
                    {user.isAdmin && <Link className="text-brand-700 hover:underline" href="/admin/outlets">Settings</Link>}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
      {groups.length === 0 && <p className="mt-8 text-sm text-zinc-500">No outlets assigned to you yet.</p>}
    </div>
  );
}
