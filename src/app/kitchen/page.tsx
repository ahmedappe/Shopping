import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ChefHat, Wine } from "lucide-react";
import { requireCatalogEditor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { resolvePosOutlet } from "@/lib/pos";
import { AutoRefresh } from "@/components/pos/auto-refresh";
import { StationBoard, type Ticket } from "./station-board";

export const metadata: Metadata = { title: "Kitchen / Bar", robots: { index: false } };
export const dynamic = "force-dynamic";

type Row = {
  id: string;
  name: string;
  quantity: number;
  note: string | null;
  status: "new" | "preparing" | "ready";
  created_at: string;
  order: { id: string; order_no: string; order_type: string; guest_name: string | null; table: { name: string } | null };
};

export default async function StationPage({ searchParams }: { searchParams: Promise<{ outlet?: string; station?: string }> }) {
  const user = await requireCatalogEditor();
  const sp = await searchParams;
  const station: "kitchen" | "bar" = sp.station === "bar" ? "bar" : "kitchen";
  const { outlets, outlet } = await resolvePosOutlet(user, sp.outlet, "/kitchen");

  if (!outlet) {
    return (
      <main className="mx-auto min-h-dvh max-w-3xl p-6">
        <h1 className="text-2xl font-bold">Which outlet is this screen for?</h1>
        <p className="mt-1 text-sm text-zinc-500">Bookmark the page after choosing, so the screen opens straight to it. Kitchen and bar are separate screens.</p>
        <ul className="mt-6 grid gap-3 sm:grid-cols-2">
          {outlets.flatMap((o) => [
            <li key={`${o.id}k`}><Link href={`/kitchen?outlet=${o.slug}&station=kitchen`} className="card flex min-h-20 items-center gap-3 p-5 text-lg font-semibold hover:bg-zinc-50"><ChefHat className="size-5" /> {o.name} kitchen</Link></li>,
            <li key={`${o.id}b`}><Link href={`/kitchen?outlet=${o.slug}&station=bar`} className="card flex min-h-20 items-center gap-3 p-5 text-lg font-semibold hover:bg-zinc-50"><Wine className="size-5" /> {o.name} bar</Link></li>,
          ])}
        </ul>
      </main>
    );
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("pos_order_items")
    .select("id, name, quantity, note, status, created_at, order:pos_orders!inner(id, order_no, order_type, guest_name, status, outlet_id, table:dining_tables(name))")
    .eq("station", station)
    .in("status", ["new", "preparing", "ready"])
    .eq("order.outlet_id", outlet.id)
    .eq("order.status", "open")
    .order("created_at")
    .limit(500);

  const map = new Map<string, Ticket>();
  for (const r of (data ?? []) as unknown as Row[]) {
    const key = r.order.id;
    const t = map.get(key) ?? {
      orderId: key,
      label: r.order.table ? `Table ${r.order.table.name}` : `${r.order.order_type === "delivery" ? "Delivery" : "Take away"}${r.order.guest_name ? ` · ${r.order.guest_name}` : ` · ${r.order.order_no}`}`,
      since: r.created_at,
      items: [],
    };
    t.items.push({ id: r.id, name: r.name, quantity: r.quantity, note: r.note, status: r.status, at: r.created_at });
    if (r.created_at < t.since) t.since = r.created_at;
    map.set(key, t);
  }

  const Icon = station === "bar" ? Wine : ChefHat;
  return (
    <main className="min-h-dvh bg-zinc-950 p-3 text-white sm:p-5">
      <AutoRefresh seconds={4} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-bold"><Icon className="size-6" /> {outlet.name} · {station === "bar" ? "Bar" : "Kitchen"}</h1>
        <div className="flex gap-2 text-sm">
          <Link href={`/kitchen?outlet=${outlet.slug}&station=${station === "bar" ? "kitchen" : "bar"}`} className="rounded-lg border border-zinc-600 px-3 py-2 hover:bg-zinc-800">
            Switch to {station === "bar" ? "kitchen" : "bar"}
          </Link>
          <Link href={`/pos?outlet=${outlet.slug}`} className="inline-flex items-center gap-1 rounded-lg border border-zinc-600 px-3 py-2 hover:bg-zinc-800"><ArrowLeft className="size-4" /> POS</Link>
        </div>
      </div>
      <StationBoard tickets={[...map.values()].sort((a, b) => a.since.localeCompare(b.since))} />
    </main>
  );
}
