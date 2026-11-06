import type { Metadata } from "next";
import { requireCatalogEditor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getAdminOutlets } from "@/lib/admin-outlets";
import { OutletFilter } from "@/components/admin/outlet-filter";
import { sanitizeSearch } from "@/lib/utils";
import { CustomerPanels, type CustomerRow } from "./panels";

export const metadata: Metadata = { title: "Customers & loyalty" };

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ outlet?: string; q?: string }> }) {
  const user = await requireCatalogEditor();
  const outlets = await getAdminOutlets(user);
  const sp = await searchParams;
  const outlet = outlets.find((o) => o.slug === sp.outlet) ?? outlets[0];
  if (!outlet) return <p className="text-zinc-500">You are not assigned to any outlet yet.</p>;

  const supabase = await createClient();
  const q = sanitizeSearch(sp.q ?? "");
  let query = supabase.from("outlet_customers").select("id, name, phone, points_balance, referral_code, referred_by, created_at").eq("outlet_id", outlet.id).order("created_at", { ascending: false }).limit(200);
  if (q) query = query.or(`name.ilike.%${q}%,phone.ilike.%${q}%`);
  const [{ data: rows }, { data: o }] = await Promise.all([
    query,
    supabase.from("outlets").select("loyalty_earn_per_100, loyalty_point_value, loyalty_referral_bonus").eq("id", outlet.id).single(),
  ]);
  const list = (rows ?? []) as { id: string; name: string; phone: string; points_balance: number; referral_code: string; referred_by: string | null }[];
  const names = new Map(list.map((c) => [c.id, c.name]));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Customers & loyalty</h1>
        <p className="text-sm text-zinc-500">Each outlet has its own customer list. Customers are added at the POS when taking an order.</p>
      </div>
      <OutletFilter outlets={outlets} selectedSlug={outlet.slug} basePath="/admin/customers" allLabel="" />
      <form className="flex gap-2">
        <input type="hidden" name="outlet" value={outlet.slug} />
        <input className="input flex-1" name="q" defaultValue={sp.q ?? ""} placeholder="Search name or phone" />
        <button className="btn-outline">Search</button>
      </form>
      <CustomerPanels
        key={outlet.id}
        outletId={outlet.id}
        isAdmin={user.isAdmin}
        canAdjust={user.canManageStore}
        earn={Number(o?.loyalty_earn_per_100 ?? 0)}
        value={Number(o?.loyalty_point_value ?? 0)}
        bonus={Number(o?.loyalty_referral_bonus ?? 0)}
        customers={list.map<CustomerRow>((c) => ({ id: c.id, name: c.name, phone: c.phone, points: Number(c.points_balance), code: c.referral_code, referredBy: c.referred_by ? (names.get(c.referred_by) ?? null) : null }))}
      />
    </div>
  );
}
