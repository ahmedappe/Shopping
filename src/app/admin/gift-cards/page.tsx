import type { Metadata } from "next";
import { requireManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getAdminOutlets } from "@/lib/admin-outlets";
import { OutletFilter } from "@/components/admin/outlet-filter";
import { MoneyPanels, type Card, type RateRow } from "./panels";

export const metadata: Metadata = { title: "Gift cards & currency" };

export default async function GiftCardsPage({ searchParams }: { searchParams: Promise<{ outlet?: string }> }) {
  const user = await requireManager();
  const outlets = await getAdminOutlets(user);
  const sp = await searchParams;
  const outlet = outlets.find((o) => o.slug === sp.outlet) ?? outlets[0];
  if (!outlet) return <p className="text-zinc-500">You are not assigned to any outlet yet.</p>;
  if (!outlet.company_id) return <p className="text-zinc-500">This outlet is not linked to a company yet.</p>;

  const supabase = await createClient();
  const [{ data: cards }, { data: rates }, { data: o }] = await Promise.all([
    supabase.from("gift_cards").select("code, initial_amount, balance, holder, is_active, issued_at").eq("company_id", outlet.company_id).order("issued_at", { ascending: false }).limit(200),
    supabase.from("currency_rates").select("code, rate_to_mvr").eq("company_id", outlet.company_id).order("code"),
    supabase.from("outlets").select("require_cash_session").eq("id", outlet.id).single(),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Gift cards & currency</h1>
        <p className="text-sm text-zinc-500">Gift cards work at every outlet of {outlet.name}&apos;s company. Exchange rates are also shared by the company.</p>
      </div>
      <OutletFilter outlets={outlets} selectedSlug={outlet.slug} basePath="/admin/gift-cards" allLabel="" />
      <MoneyPanels
        key={outlet.id}
        outletId={outlet.id}
        isAdmin={user.isAdmin}
        requireSession={Boolean(o?.require_cash_session)}
        cards={((cards ?? []) as { code: string; initial_amount: number; balance: number; holder: string | null; is_active: boolean; issued_at: string }[]).map<Card>((c) => ({
          code: c.code,
          initial: Number(c.initial_amount),
          balance: Number(c.balance),
          holder: c.holder,
          active: c.is_active,
          issuedAt: c.issued_at,
        }))}
        rates={((rates ?? []) as { code: string; rate_to_mvr: number }[]).map<RateRow>((r) => ({ code: r.code, rate: Number(r.rate_to_mvr) }))}
      />
    </div>
  );
}
