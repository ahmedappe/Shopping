import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, LogOut } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { StatusBadge } from "@/components/status-badge";
import { formatDate, formatPrice } from "@/lib/utils";
import type { Order } from "@/lib/types";

export const metadata: Metadata = { title: "My orders" };

export default async function OrdersPage() {
  const user = await requireUser("/orders");
  const supabase = await createClient();
  const { data } = await supabase
    .from("orders")
    .select("id, order_number, status, total, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);
  const orders = (data ?? []) as Pick<Order, "id" | "order_number" | "status" | "total" | "created_at">[];

  return (
    <div className="container-page max-w-3xl py-10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">My orders</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Signed in as {user.fullName ? `${user.fullName} · ` : ""}
            {user.email}
          </p>
        </div>
        <form action="/auth/signout" method="post">
          <button type="submit" className="btn-outline">
            <LogOut className="size-4" /> Sign out
          </button>
        </form>
      </div>

      {orders.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-zinc-300 p-12 text-center">
          <p className="font-medium">No orders yet</p>
          <Link href="/products" className="btn-primary mt-5">
            Start shopping
          </Link>
        </div>
      ) : (
        <ul className="mt-8 divide-y divide-zinc-200 rounded-xl border border-zinc-200">
          {orders.map((o) => (
            <li key={o.id}>
              <Link href={`/orders/${o.id}`} className="flex items-center gap-4 p-4 hover:bg-zinc-50">
                <div className="flex-1">
                  <p className="font-medium">{o.order_number}</p>
                  <p className="text-sm text-zinc-500">{formatDate(o.created_at)}</p>
                </div>
                <StatusBadge status={o.status} />
                <p className="w-28 text-right font-semibold">{formatPrice(o.total)}</p>
                <ChevronRight className="size-4 text-zinc-400" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
