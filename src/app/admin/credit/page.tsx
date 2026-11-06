import type { Metadata } from "next";
import { requireCatalogEditor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getAdminOutlets } from "@/lib/admin-outlets";
import { OutletFilter } from "@/components/admin/outlet-filter";
import { CreditPanels, type Debtor, type LedgerRow } from "./panels";

export const metadata: Metadata = { title: "Customer credit" };

type Cust = { id: string; name: string; phone: string; credit_limit: number; credit_balance: number };
type Led = { kind: "sale" | "payment" | "adjust"; amount: number; method: string | null; reference: string | null; at: string };

/** What the customer still owes is made up of their newest sales: the oldest ones are treated as paid first. */
function ageing(balance: number, sales: { amount: number; at: string }[]) {
  const buckets = { current: 0, d30: 0, d60: 0, d90: 0 };
  let left = balance;
  for (const s of [...sales].sort((a, b) => b.at.localeCompare(a.at))) {
    if (left <= 0) break;
    const part = Math.min(left, s.amount);
    left -= part;
    const days = (Date.now() - new Date(s.at).getTime()) / 86_400_000;
    if (days <= 30) buckets.current += part;
    else if (days <= 60) buckets.d30 += part;
    else if (days <= 90) buckets.d60 += part;
    else buckets.d90 += part;
  }
  return buckets;
}

export default async function CreditPage({ searchParams }: { searchParams: Promise<{ outlet?: string }> }) {
  const user = await requireCatalogEditor();
  const outlets = await getAdminOutlets(user);
  const sp = await searchParams;
  const outlet = outlets.find((o) => o.slug === sp.outlet) ?? outlets[0];
  if (!outlet) return <p className="text-zinc-500">You are not assigned to any outlet yet.</p>;

  const supabase = await createClient();
  const { data: custs } = await supabase
    .from("outlet_customers")
    .select("id, name, phone, credit_limit, credit_balance")
    .eq("outlet_id", outlet.id)
    .or("credit_balance.gt.0,credit_limit.gt.0")
    .order("credit_balance", { ascending: false })
    .limit(300);
  const list = (custs ?? []) as unknown as Cust[];
  const ids = list.map((c) => c.id);
  const { data: led } = ids.length
    ? await supabase.from("customer_ledger").select("customer_id, kind, amount, method, reference, at").in("customer_id", ids).order("at", { ascending: false }).limit(3000)
    : { data: [] };
  const ledger = (led ?? []) as unknown as (Led & { customer_id: string })[];

  const debtors: Debtor[] = list.map((c) => {
    const mine = ledger.filter((l) => l.customer_id === c.id);
    const rows: LedgerRow[] = mine.slice(0, 40).map((l) => ({ kind: l.kind, amount: Number(l.amount), method: l.method, reference: l.reference, at: l.at }));
    return {
      id: c.id,
      name: c.name,
      phone: c.phone,
      limit: Number(c.credit_limit),
      balance: Number(c.credit_balance),
      age: ageing(Number(c.credit_balance), mine.filter((l) => l.kind === "sale").map((l) => ({ amount: Number(l.amount), at: l.at }))),
      ledger: rows,
    };
  });
  const total = debtors.reduce((n, d) => n + d.balance, 0);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Customer credit</h1>
        <p className="text-sm text-zinc-500">Customers who buy on account at {outlet.name}. Set a limit here, then choose “on account” when taking payment at the POS.</p>
      </div>
      <OutletFilter outlets={outlets} selectedSlug={outlet.slug} basePath="/admin/credit" allLabel="" />
      <CreditPanels key={outlet.id} total={total} debtors={debtors} canSetLimit={user.canManageStore} />
    </div>
  );
}
