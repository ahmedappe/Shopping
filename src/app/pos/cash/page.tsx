import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireCatalogEditor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { resolvePosOutlet } from "@/lib/pos";
import { formatDate, formatPrice } from "@/lib/utils";
import { CashPanel } from "./cash-panel";

export const metadata: Metadata = { title: "Cash drawer", robots: { index: false } };
export const dynamic = "force-dynamic";

type Session = { id: string; status: "open" | "closed"; opening_float: number; opened_at: string; closed_at: string | null; expected_cash: number | null; counted_cash: number | null; note: string | null };
type Move = { id: string; kind: "pay_in" | "pay_out"; amount: number; reason: string; at: string };

export default async function CashPage({ searchParams }: { searchParams: Promise<{ outlet?: string }> }) {
  const user = await requireCatalogEditor();
  const sp = await searchParams;
  const { outlets, outlet } = await resolvePosOutlet(user, sp.outlet, "/pos/cash");
  if (!outlet) {
    return (
      <main className="mx-auto min-h-dvh max-w-3xl p-6">
        <h1 className="text-2xl font-bold">Which outlet?</h1>
        <ul className="mt-6 grid gap-3 sm:grid-cols-2">
          {outlets.map((o) => (
            <li key={o.id}><Link href={`/pos/cash?outlet=${o.slug}`} className="card flex min-h-20 items-center p-5 text-lg font-semibold hover:bg-zinc-50">{o.name}</Link></li>
          ))}
        </ul>
      </main>
    );
  }

  const supabase = await createClient();
  const { data: sessions } = await supabase
    .from("cash_sessions")
    .select("id, status, opening_float, opened_at, closed_at, expected_cash, counted_cash, note")
    .eq("outlet_id", outlet.id)
    .order("opened_at", { ascending: false })
    .limit(15);
  const list = (sessions ?? []) as unknown as Session[];
  const current = list.find((s) => s.status === "open") ?? null;

  let expected: number | null = null;
  let moves: Move[] = [];
  if (current) {
    const [{ data: exp }, { data: mv }] = await Promise.all([
      supabase.rpc("cash_expected", { p_session: current.id }),
      supabase.from("cash_movements").select("id, kind, amount, reason, at").eq("session_id", current.id).order("at"),
    ]);
    expected = exp === null ? null : Number(exp);
    moves = (mv ?? []) as unknown as Move[];
  }

  return (
    <main className="mx-auto min-h-dvh max-w-3xl space-y-5 p-4 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{outlet.name} · cash drawer</h1>
        <Link href={`/pos?outlet=${outlet.slug}`} className="btn-ghost"><ArrowLeft className="size-4" /> POS</Link>
      </div>
      <CashPanel
        outletId={outlet.id}
        session={current ? { id: current.id, float: Number(current.opening_float), since: current.opened_at } : null}
        expected={expected}
        moves={moves.map((m) => ({ ...m, amount: Number(m.amount) }))}
        showExpected={user.canManageStore}
      />
      <section className="card p-4">
        <h2 className="font-semibold">Recent drawers</h2>
        <ul className="mt-2 divide-y text-sm">
          {list.filter((s) => s.status === "closed").map((s) => {
            const diff = Number(s.counted_cash) - Number(s.expected_cash);
            return (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>{formatDate(s.opened_at, true)} → {s.closed_at ? formatDate(s.closed_at, true) : ""}</span>
                {user.canManageStore ? (
                  <span className={diff === 0 ? "text-emerald-700" : "font-semibold text-red-700"}>
                    counted {formatPrice(s.counted_cash)} · expected {formatPrice(s.expected_cash)} · {diff === 0 ? "balanced" : diff > 0 ? `over ${formatPrice(diff)}` : `short ${formatPrice(-diff)}`}
                  </span>
                ) : (
                  <span className="text-zinc-500">closed</span>
                )}
              </li>
            );
          })}
          {list.every((s) => s.status === "open") && <li className="py-2 text-zinc-500">No closed drawers yet.</li>}
        </ul>
      </section>
    </main>
  );
}
