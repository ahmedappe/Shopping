import type { Metadata } from "next";
import { requireCatalogEditor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getAdminOutlets } from "@/lib/admin-outlets";
import { OutletFilter } from "@/components/admin/outlet-filter";
import { variantLabel } from "@/lib/utils";
import { IngredientsPanel, RecipesPanel, type IngredientRow, type RecipeItem } from "./panels";

export const metadata: Metadata = { title: "Recipes & ingredients" };

export default async function RecipesPage({ searchParams }: { searchParams: Promise<{ outlet?: string }> }) {
  const user = await requireCatalogEditor();
  const outlets = await getAdminOutlets(user);
  const sp = await searchParams;
  const outlet = outlets.find((o) => o.slug === sp.outlet) ?? outlets[0];
  if (!outlet) return <p className="text-zinc-500">You are not assigned to any outlet yet.</p>;
  if (!outlet.company_id) return <p className="text-zinc-500">This outlet is not linked to a company yet.</p>;

  const supabase = await createClient();
  const [{ data: ings }, { data: stock }, { data: items }] = await Promise.all([
    supabase.from("ingredients").select("id, name, unit, is_active").eq("company_id", outlet.company_id).eq("is_active", true).order("name"),
    supabase.from("ingredient_stock").select("ingredient_id, qty, reorder_level").eq("outlet_id", outlet.id),
    supabase
      .from("outlet_variants")
      .select("variant_id, variant:product_variants!inner(option1, option2, product:products!inner(name))")
      .eq("outlet_id", outlet.id)
      .eq("is_active", true)
      .not("station", "is", null)
      .limit(1000),
  ]);
  const variantIds = (items ?? []).map((i) => i.variant_id as string);
  const { data: lines } = variantIds.length
    ? await supabase.from("recipe_lines").select("variant_id, ingredient_id, qty").in("variant_id", variantIds)
    : { data: [] };

  type StockRow = { ingredient_id: string; qty: number | string; reorder_level: number | string | null };
  const stockMap = new Map(((stock ?? []) as StockRow[]).map((s) => [s.ingredient_id, s]));
  const ingredients: IngredientRow[] = (ings ?? []).map((i) => ({
    id: i.id as string,
    name: i.name as string,
    unit: i.unit as string,
    qty: Number(stockMap.get(i.id as string)?.qty ?? 0),
    reorder: stockMap.get(i.id as string)?.reorder_level != null ? Number(stockMap.get(i.id as string)!.reorder_level) : null,
  }));
  const recipes: RecipeItem[] = ((items ?? []) as unknown as { variant_id: string; variant: { option1: string | null; option2: string | null; product: { name: string } } }[])
    .map((i) => ({
      variantId: i.variant_id,
      label: `${i.variant.product.name}${variantLabel(i.variant) ? ` · ${variantLabel(i.variant)}` : ""}`,
      lines: (lines ?? []).filter((l) => l.variant_id === i.variant_id).map((l) => ({ ingredientId: l.ingredient_id as string, qty: Number(l.qty) })),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Recipes &amp; ingredients</h1>
        <p className="text-sm text-zinc-500">Ingredients are shared by the company; stock is counted per outlet. Every sale takes its recipe quantities off the outlet&apos;s ingredient stock.</p>
      </div>
      <OutletFilter outlets={outlets} selectedSlug={outlet.slug} basePath="/admin/recipes" allLabel="" />
      <IngredientsPanel key={outlet.id} outletId={outlet.id} companyId={outlet.company_id} canManage={user.canManageStore} ingredients={ingredients} />
      <RecipesPanel key={`r${outlet.id}`} canManage={user.canManageStore} items={recipes} ingredients={ingredients.map((i) => ({ id: i.id, name: i.name, unit: i.unit }))} />
    </div>
  );
}
