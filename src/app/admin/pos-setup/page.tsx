import type { Metadata } from "next";
import { headers } from "next/headers";
import { requireManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getAdminOutlets } from "@/lib/admin-outlets";
import { OutletFilter } from "@/components/admin/outlet-filter";
import { variantLabel } from "@/lib/utils";
import { OutletSettingsForm, StationList, TablesEditor, type TableRow, type StationRow } from "./setup-forms";

export const metadata: Metadata = { title: "POS setup" };

export default async function PosSetupPage({ searchParams }: { searchParams: Promise<{ outlet?: string }> }) {
  const user = await requireManager();
  const outlets = await getAdminOutlets(user);
  const sp = await searchParams;
  const outlet = outlets.find((o) => o.slug === sp.outlet) ?? outlets[0];
  if (!outlet) return <p className="text-zinc-500">You are not assigned to any outlet yet.</p>;

  const supabase = await createClient();
  const [{ data: o }, { data: tables }, { data: variants }] = await Promise.all([
    supabase.from("outlets").select("service_charge_pct, receipt_header, receipt_footer").eq("id", outlet.id).single(),
    supabase.from("dining_tables").select("id, name, seats, is_active, qr_token").eq("outlet_id", outlet.id).order("sort_order").order("name"),
    supabase
      .from("outlet_variants")
      .select("variant_id, station, variant:product_variants!inner(option1, option2, product:products!inner(name, category:categories(name)))")
      .eq("outlet_id", outlet.id)
      .eq("is_active", true)
      .limit(2000),
  ]);

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${host}`;

  const stations: StationRow[] = ((variants ?? []) as unknown as {
    variant_id: string;
    station: "kitchen" | "bar" | null;
    variant: { option1: string | null; option2: string | null; product: { name: string; category: { name: string } | null } };
  }[])
    .map((v) => ({
      variantId: v.variant_id,
      label: `${v.variant.product.name}${variantLabel(v.variant) ? ` · ${variantLabel(v.variant)}` : ""}`,
      category: v.variant.product.category?.name ?? "Other",
      station: v.station,
    }))
    .sort((a, b) => a.category.localeCompare(b.category) || a.label.localeCompare(b.label));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">POS setup</h1>
        <p className="text-sm text-zinc-500">Tables, service charge, receipt text, and which screen each menu item goes to.</p>
      </div>
      <OutletFilter outlets={outlets} selectedSlug={outlet.slug} basePath="/admin/pos-setup" allLabel="" />

      <OutletSettingsForm
        key={outlet.id}
        outletId={outlet.id}
        canEdit={user.isAdmin}
        serviceChargePct={Number(o?.service_charge_pct ?? 0)}
        header={(o?.receipt_header as string | null) ?? ""}
        footer={(o?.receipt_footer as string | null) ?? ""}
      />
      <TablesEditor
        key={`t${outlet.id}`}
        outletId={outlet.id}
        origin={origin}
        tables={((tables ?? []) as { id: string; name: string; seats: number; is_active: boolean; qr_token: string }[]).map<TableRow>((t) => ({
          id: t.id,
          name: t.name,
          seats: t.seats,
          active: t.is_active,
          token: t.qr_token,
        }))}
      />
      <StationList key={`s${outlet.id}`} outletId={outlet.id} rows={stations} />
    </div>
  );
}
