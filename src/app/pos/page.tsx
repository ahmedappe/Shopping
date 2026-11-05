import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ChefHat, Wine } from "lucide-react";
import { requireCatalogEditor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { resolvePosOutlet } from "@/lib/pos";
import { formatPrice } from "@/lib/utils";
import { AutoRefresh } from "@/components/pos/auto-refresh";
import { TablesBoard, type BoardTable, type BoardOrder, type BoardRequest } from "./tables-board";

export const metadata: Metadata = { title: "POS", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function PosPage({ searchParams }: { searchParams: Promise<{ outlet?: string }> }) {
  const user = await requireCatalogEditor();
  const { outlets, outlet } = await resolvePosOutlet(user, (await searchParams).outlet, "/pos");

  if (!outlet) {
    return (
      <main className="mx-auto min-h-dvh max-w-3xl p-6">
        <h1 className="text-2xl font-bold">Which outlet is this POS for?</h1>
        <p className="mt-1 text-sm text-zinc-500">Bookmark the page after choosing, so the counter opens straight to it.</p>
        <ul className="mt-6 grid gap-3 sm:grid-cols-2">
          {outlets.map((o) => (
            <li key={o.id}>
              <Link href={`/pos?outlet=${o.slug}`} className="card flex min-h-20 items-center p-5 text-lg font-semibold hover:bg-zinc-50">
                {o.name}
              </Link>
            </li>
          ))}
          {outlets.length === 0 && <li className="text-zinc-500">You are not assigned to any outlet yet. Ask an admin for outlet access.</li>}
        </ul>
      </main>
    );
  }

  const supabase = await createClient();
  const [{ data: tables }, { data: orders }, { data: requests }] = await Promise.all([
    supabase.from("dining_tables").select("id, name, seats").eq("outlet_id", outlet.id).eq("is_active", true).order("sort_order").order("name"),
    supabase
      .from("pos_orders")
      .select("id, order_no, table_id, order_type, guest_name, opened_at, first_sent_at, total, items:pos_order_items(status)")
      .eq("outlet_id", outlet.id)
      .eq("status", "open")
      .order("opened_at"),
    supabase
      .from("table_requests")
      .select("id, table_id, kind, created_at, table:dining_tables!inner(outlet_id)")
      .eq("table.outlet_id", outlet.id)
      .is("resolved_at", null)
      .order("created_at"),
  ]);

  const boardOrders: BoardOrder[] = (orders ?? []).map((o) => {
    const items = ((o.items as { status: string }[] | null) ?? []).filter((i) => i.status !== "void");
    return {
      id: o.id as string,
      orderNo: o.order_no as string,
      tableId: (o.table_id as string | null) ?? null,
      type: o.order_type as BoardOrder["type"],
      guest: (o.guest_name as string | null) ?? null,
      openedAt: o.opened_at as string,
      firstSentAt: (o.first_sent_at as string | null) ?? null,
      total: formatPrice(o.total as number),
      waiting: items.filter((i) => i.status === "new" || i.status === "preparing").length,
      ready: items.filter((i) => i.status === "ready").length,
    };
  });

  return (
    <main className="mx-auto min-h-dvh max-w-6xl p-4 sm:p-6">
      <AutoRefresh seconds={8} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{outlet.name} · POS</h1>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Link href={`/kitchen?outlet=${outlet.slug}&station=kitchen`} className="btn-outline"><ChefHat className="size-4" /> Kitchen</Link>
          <Link href={`/kitchen?outlet=${outlet.slug}&station=bar`} className="btn-outline"><Wine className="size-4" /> Bar</Link>
          {outlets.length > 1 && <Link href="/pos" className="btn-outline">Change outlet</Link>}
          <Link href="/admin/products" className="btn-ghost"><ArrowLeft className="size-4" /> Admin</Link>
        </div>
      </div>
      <TablesBoard
        outletId={outlet.id}
        tables={(tables ?? []) as BoardTable[]}
        orders={boardOrders}
        requests={((requests ?? []) as { id: string; table_id: string; kind: BoardRequest["kind"]; created_at: string }[]).map((r) => ({
          id: r.id,
          tableId: r.table_id,
          kind: r.kind,
          at: r.created_at,
        }))}
      />
      {(tables ?? []).length === 0 && (
        <p className="mt-6 rounded-lg border border-dashed p-4 text-sm text-zinc-500">
          No tables yet. {user.canManageStore ? <Link className="underline" href="/admin/pos-setup">Add tables in POS setup</Link> : "Ask a manager to add tables in POS setup."}
        </p>
      )}
    </main>
  );
}
