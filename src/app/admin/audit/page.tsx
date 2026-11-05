import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Audit log" };

const PAGE_SIZE = 50;

const TABLES: Record<string, string> = {
  products: "Products",
  product_variants: "Variants",
  outlet_variants: "Outlet price & stock",
  variant_costs: "Cost prices",
  stock_transfers: "Stock transfers",
  orders: "Orders",
  suppliers: "Suppliers",
  product_suppliers: "Product suppliers",
  categories: "Categories",
  outlets: "Outlets",
  companies: "Companies",
  profiles: "Users",
  outlet_users: "Outlet access",
  user_companies: "Company access",
  store_settings: "Store settings",
};

// Fields that change on every save and say nothing useful.
const NOISE = new Set(["updated_at", "created_at"]);

type Entry = {
  id: number;
  at: string;
  user_id: string | null;
  table_name: string;
  record_id: string | null;
  action: "insert" | "update" | "delete";
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
};

function show(v: unknown) {
  if (v === null || v === undefined) return "—";
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  return s.length > 60 ? `${s.slice(0, 57)}…` : s;
}

function changes(e: Entry) {
  if (e.action === "update" && e.old_data && e.new_data) {
    return Object.keys(e.new_data)
      .filter((k) => !NOISE.has(k) && JSON.stringify(e.old_data![k]) !== JSON.stringify(e.new_data![k]))
      .map((k) => ({ field: k, from: show(e.old_data![k]), to: show(e.new_data![k]) }));
  }
  const data = e.new_data ?? e.old_data ?? {};
  const label = data.name ?? data.order_number ?? data.username ?? data.full_name ?? null;
  return label ? [{ field: "name", from: e.action === "delete" ? show(label) : "", to: e.action === "delete" ? "" : show(label) }] : [];
}

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ table?: string; user?: string; action?: string; from?: string; to?: string; page?: string }>;
}) {
  await requireAdmin();
  const p = await searchParams;
  const page = Math.max(1, Number(p.page) || 1);
  const supabase = await createClient();

  let query = supabase
    .from("audit_log")
    .select("id, at, user_id, table_name, record_id, action, old_data, new_data", { count: "exact" })
    .order("at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (p.table && TABLES[p.table]) query = query.eq("table_name", p.table);
  if (p.action && ["insert", "update", "delete"].includes(p.action)) query = query.eq("action", p.action);
  if (p.user && /^[0-9a-f-]{36}$/.test(p.user)) query = query.eq("user_id", p.user);
  if (p.from && /^\d{4}-\d{2}-\d{2}$/.test(p.from)) query = query.gte("at", `${p.from}T00:00:00`);
  if (p.to && /^\d{4}-\d{2}-\d{2}$/.test(p.to)) query = query.lte("at", `${p.to}T23:59:59`);

  const [{ data, count }, { data: people }] = await Promise.all([
    query,
    supabase.from("profiles").select("id, full_name, username").neq("role", "customer").order("full_name"),
  ]);
  const entries = (data ?? []) as Entry[];
  const staff = (people ?? []) as { id: string; full_name: string | null; username: string | null }[];
  const who = new Map(staff.map((s) => [s.id, s.full_name || s.username || "Staff"]));
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
  const qs = (n: number) => {
    const sp = new URLSearchParams(Object.entries(p).filter(([k, v]) => k !== "page" && v) as [string, string][]);
    sp.set("page", String(n));
    return `?${sp.toString()}`;
  };

  return (
    <div className="max-w-6xl">
      <h1 className="text-2xl font-bold tracking-tight">Audit log</h1>
      <p className="mt-1 text-sm text-zinc-500">Every change to products, prices, stock, transfers, orders, suppliers, outlets and users. Nobody can edit or delete these records.</p>

      <form className="mt-6 flex flex-wrap items-end gap-3">
        <div>
          <label className="label" htmlFor="table">Area</label>
          <select id="table" name="table" defaultValue={p.table ?? ""} className="input">
            <option value="">All</option>
            {Object.entries(TABLES).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="user">Who</label>
          <select id="user" name="user" defaultValue={p.user ?? ""} className="input">
            <option value="">Anyone</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>{s.full_name || s.username || s.id.slice(0, 8)}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="action">Action</label>
          <select id="action" name="action" defaultValue={p.action ?? ""} className="input">
            <option value="">Any</option>
            <option value="insert">Added</option>
            <option value="update">Changed</option>
            <option value="delete">Deleted</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="from">From</label>
          <input id="from" name="from" type="date" defaultValue={p.from ?? ""} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="to">To</label>
          <input id="to" name="to" type="date" defaultValue={p.to ?? ""} className="input" />
        </div>
        <button className="btn-outline" type="submit">Filter</button>
      </form>

      <div className="card mt-4 overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs font-medium text-zinc-500 uppercase">
            <tr>
              <th className="px-4 py-3">When</th>
              <th className="px-4 py-3">Who</th>
              <th className="px-4 py-3">What</th>
              <th className="px-4 py-3">Changes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 align-top">
            {entries.map((e) => {
              const ch = changes(e);
              return (
                <tr key={e.id}>
                  <td className="px-4 py-3 whitespace-nowrap">{formatDate(e.at, true)}</td>
                  <td className="px-4 py-3">{e.user_id ? (who.get(e.user_id) ?? "Customer") : "System"}</td>
                  <td className="px-4 py-3">
                    <span className="font-medium">{e.action === "insert" ? "Added" : e.action === "update" ? "Changed" : "Deleted"}</span>{" "}
                    {TABLES[e.table_name] ?? e.table_name}
                    {e.record_id && <span className="block text-xs text-zinc-400">{e.record_id.slice(0, 40)}</span>}
                  </td>
                  <td className="px-4 py-3">
                    {ch.length === 0 ? (
                      <span className="text-zinc-400">—</span>
                    ) : (
                      <ul className="space-y-0.5">
                        {ch.slice(0, 8).map((c) => (
                          <li key={c.field}>
                            <span className="text-zinc-500">{c.field}:</span> {c.from && <span className="line-through decoration-zinc-400">{c.from}</span>}
                            {c.from && c.to && " → "}
                            {c.to}
                          </li>
                        ))}
                        {ch.length > 8 && <li className="text-xs text-zinc-500">+{ch.length - 8} more</li>}
                      </ul>
                    )}
                  </td>
                </tr>
              );
            })}
            {entries.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-zinc-500">No changes recorded for this filter.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          {page > 1 ? <Link href={qs(page - 1)} className="btn-outline">Newer</Link> : <span />}
          <span className="text-zinc-500">Page {page} of {pages}</span>
          {page < pages ? <Link href={qs(page + 1)} className="btn-outline">Older</Link> : <span />}
        </div>
      )}
    </div>
  );
}
