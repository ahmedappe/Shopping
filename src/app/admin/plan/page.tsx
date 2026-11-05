import type { Metadata } from "next";
import { requireCatalogEditor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getAdminOutlets } from "@/lib/admin-outlets";
import { OutletFilter } from "@/components/admin/outlet-filter";
import { variantLabel } from "@/lib/utils";
import { Planner, type PlanIngredient, type PlanItem, type PlanLine } from "./planner";

export const metadata: Metadata = { title: "Big order planner" };

export default async function PlanPage({ searchParams }: { searchParams: Promise<{ outlet?: string }> }) {
  const user = await requireCatalogEditor();
  const outlets = await getAdminOutlets(user);
  const sp = await searchParams;
  const outlet = outlets.find((o) => o.slug === sp.outlet) ?? outlets[0];
  if (!outlet) return <p className="text-zinc-500">You are not assigned to any outlet yet.</p>;
  if (!outlet.company_id) return <p className="text-zinc-500">This outlet is not linked to a company yet.</p>;

  const supabase = await createClient();
  const [{ data: items }, { data: ings }, { data: stock }] = await Promise.all([
    supabase
      .from("outlet_variants")
      .select("variant_id, variant:product_variants!inner(option1, option2, product:products!inner(name))")
      .eq("outlet_id", outlet.id)
      .eq("is_active", true)
      .not("station", "is", null)
      .limit(1000),
    supabase.from("ingredients").select("id, name, unit").eq("company_id", outlet.company_id).eq("is_active", true),
    supabase.from("ingredient_stock").select("ingredient_id, qty").eq("outlet_id", outlet.id),
  ]);
  const variantIds = (items ?? []).map((i) => i.variant_id as string);
  const { data: lines } = variantIds.length
    ? await supabase.from("recipe_lines").select("variant_id, ingredient_id, qty").in("variant_id", variantIds)
    : { data: [] };

  type ItemRow = { variant_id: string; variant: { option1: string | null; option2: string | null; product: { name: string } } };
  const planItems: PlanItem[] = ((items ?? []) as unknown as ItemRow[])
    .map((i) => ({ id: i.variant_id, label: [i.variant.product.name, variantLabel(i.variant)].filter(Boolean).join(" · ") }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const planLines: PlanLine[] = (lines ?? []).map((l) => ({ variantId: l.variant_id as string, ingredientId: l.ingredient_id as string, qty: Number(l.qty) }));
  const stockMap = new Map((stock ?? []).map((s) => [s.ingredient_id as string, Number(s.qty)]));
  const planIngredients: PlanIngredient[] = (ings ?? []).map((i) => ({ id: i.id as string, name: i.name as string, unit: i.unit as string, onHand: stockMap.get(i.id as string) ?? 0 }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Big order planner</h1>
        <p className="text-sm text-zinc-500">Pick the dishes and quantities for a large order. It adds up the ingredients from your recipes and shows what you are short of at {outlet.name}.</p>
      </div>
      <OutletFilter outlets={outlets} selectedSlug={outlet.slug} basePath="/admin/plan" allLabel="" />
      <Planner key={outlet.id} outletName={outlet.name} items={planItems} lines={planLines} ingredients={planIngredients} />
    </div>
  );
}
