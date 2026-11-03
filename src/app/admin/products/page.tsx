import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ImageOff, Plus } from "lucide-react";
import { requireCatalogEditor } from "@/lib/auth";
import { getAdminOutlets, pickOutlet } from "@/lib/admin-outlets";
import { OutletFilter } from "@/components/admin/outlet-filter";
import { createClient } from "@/lib/supabase/server";
import { productImageUrl } from "@/lib/storage";
import { formatPrice, sanitizeSearch } from "@/lib/utils";
import { Pagination } from "@/components/pagination";
import { STORE } from "@/config/store";
import type { ProductListing } from "@/lib/types";

export const metadata: Metadata = { title: "Products" };
const PAGE_SIZE = 25;

export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; outlet?: string }>;
}) {
  const user = await requireCatalogEditor();
  const params = await searchParams;
  const outlets = await getAdminOutlets(user);
  const { selected } = pickOutlet(outlets, params.outlet);
  const q = sanitizeSearch(params.q ?? "");
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);

  const supabase = await createClient();
  // With an outlet picked: that outlet's price and stock (only items it sells).
  // Without: the whole catalogue (prices and stock differ per outlet — see the Stock page).
  let query = supabase
    .from(selected ? "outlet_product_listing" : "product_listing")
    .select("id,name,slug,is_active,is_featured,category_name,min_price,max_price,total_stock,variant_count,image_path", {
      count: "exact",
    })
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (selected) query = query.eq("outlet_id", selected.id);
  if (q) query = query.ilike("name", `%${q}%`);
  const { data, count } = await query;
  const products = (data ?? []) as ProductListing[];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Products</h1>
        <Link href="/admin/products/new" className="btn-primary">
          <Plus className="size-4" /> Add product
        </Link>
      </div>

      <div className="mt-4">
        <OutletFilter outlets={outlets} selectedSlug={selected?.slug} basePath="/admin/products" params={{ q: q || undefined }} allLabel="All items" />
      </div>

      <form className="mt-4 max-w-sm">
        {selected && <input type="hidden" name="outlet" value={selected.slug} />}
        <input name="q" type="search" defaultValue={q} placeholder="Search products" className="input" />
      </form>

      <div className="card mt-4 overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs font-medium text-zinc-500 uppercase">
            <tr>
              <th className="px-4 py-3">Product</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Price</th>
              <th className="px-4 py-3">Stock</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {products.map((p) => {
              const img = productImageUrl(p.image_path);
              return (
                <tr key={p.id} className="hover:bg-zinc-50">
                  <td className="px-4 py-3">
                    <Link href={`/admin/products/${p.id}`} className="flex items-center gap-3">
                      <span className="relative size-11 shrink-0 overflow-hidden rounded-md bg-zinc-100">
                        {img ? (
                          <Image src={img} alt="" fill sizes="44px" className="object-cover" />
                        ) : (
                          <ImageOff className="m-auto mt-3 size-4 text-zinc-400" />
                        )}
                      </span>
                      <span>
                        <span className="font-medium hover:underline">{p.name}</span>
                        <span className="block text-xs text-zinc-500">
                          {p.variant_count} variant{p.variant_count === 1 ? "" : "s"}
                          {p.is_featured && " · Featured"}
                        </span>
                      </span>
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-zinc-600">{p.category_name ?? "—"}</td>
                  <td className="px-4 py-3">
                    {selected ? (
                      <>
                        {formatPrice(p.min_price)}
                        {p.max_price !== p.min_price && ` – ${formatPrice(p.max_price)}`}
                      </>
                    ) : (
                      <span className="text-zinc-400">varies</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {!selected ? (
                      <span className="text-zinc-400">—</span>
                    ) : (
                    <span
                      className={
                        p.total_stock === 0
                          ? "font-semibold text-red-600"
                          : p.total_stock <= STORE.lowStockThreshold
                            ? "text-amber-600"
                            : ""
                      }
                    >
                      {p.total_stock}
                    </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {p.is_active ? (
                      <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-800">Active</span>
                    ) : (
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">Hidden</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {products.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-zinc-500">
                  No products yet.{" "}
                  <Link href="/admin/products/new" className="text-brand-700 hover:underline">
                    Add your first product
                  </Link>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Pagination
        page={page}
        pageCount={Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE))}
        basePath="/admin/products"
        params={{ q: q || undefined, outlet: selected?.slug }}
      />
    </div>
  );
}
