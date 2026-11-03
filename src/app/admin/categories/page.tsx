import type { Metadata } from "next";
import { requireCatalogEditor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CategoryForm, DeleteCategoryButton } from "./category-form";
import type { Category } from "@/lib/types";

export const metadata: Metadata = { title: "Categories" };

export default async function AdminCategoriesPage() {
  const user = await requireCatalogEditor();
  const supabase = await createClient();
  const [{ data }, { data: counts }] = await Promise.all([
    supabase.from("categories").select("id,name,slug,description,sort_order").order("sort_order").order("name"),
    supabase.from("products").select("category_id"),
  ]);
  const categories = (data ?? []) as Category[];
  const productCount = new Map<string, number>();
  for (const p of (counts ?? []) as { category_id: string | null }[]) {
    if (p.category_id) productCount.set(p.category_id, (productCount.get(p.category_id) ?? 0) + 1);
  }

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold tracking-tight">Categories</h1>

      <section className="card mt-6 p-5">
        <h2 className="font-semibold">Add category</h2>
        <CategoryForm />
      </section>

      <section className="card mt-6 divide-y divide-zinc-100">
        {categories.map((c) => (
          <details key={c.id} className="group p-5">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
              <div>
                <p className="font-medium">{c.name}</p>
                <p className="text-xs text-zinc-500">
                  /{c.slug} · {productCount.get(c.id) ?? 0} products · order {c.sort_order}
                </p>
              </div>
              <span className="text-sm text-brand-700 group-open:hidden">Edit</span>
            </summary>
            <CategoryForm category={c} />
            {user.canManageStore && (
              <div className="mt-3 flex justify-end">
                <DeleteCategoryButton id={c.id} name={c.name} />
              </div>
            )}
          </details>
        ))}
        {categories.length === 0 && <p className="p-5 text-sm text-zinc-500">No categories yet.</p>}
      </section>
    </div>
  );
}
