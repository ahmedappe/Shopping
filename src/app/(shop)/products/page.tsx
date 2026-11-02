import { Suspense } from "react";
import type { Metadata } from "next";
import { getCategories, searchProducts, type ProductSearchParams } from "@/lib/catalog";
import { ProductGrid } from "@/components/product-card";
import { ProductFilters } from "@/components/product-filters";
import { Pagination } from "@/components/pagination";

type Props = { searchParams: Promise<ProductSearchParams> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { q } = await searchParams;
  return { title: q ? `Search: ${q.slice(0, 50)}` : "Shop all" };
}

export default async function ProductsPage({ searchParams }: Props) {
  const params = await searchParams;
  const [categories, result] = await Promise.all([getCategories(), searchProducts(params)]);
  const activeCategory = categories.find((c) => c.slug === params.category);

  const heading = params.q ? `Results for “${params.q.slice(0, 50)}”` : activeCategory?.name ?? "Shop all";

  return (
    <div className="container-page py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">{heading}</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {result.total} {result.total === 1 ? "product" : "products"}
        </p>
      </div>

      <div className="grid gap-10 lg:grid-cols-[240px_1fr]">
        <Suspense>
          <ProductFilters categories={categories.map((c) => ({ name: c.name, slug: c.slug }))} />
        </Suspense>
        <div>
          {result.products.length > 0 ? (
            <ProductGrid products={result.products} />
          ) : (
            <div className="rounded-xl border border-dashed border-zinc-300 p-12 text-center">
              <p className="font-medium">No products found</p>
              <p className="mt-1 text-sm text-zinc-500">Try a different search or remove some filters.</p>
            </div>
          )}
          <Pagination
            page={result.page}
            pageCount={result.pageCount}
            basePath="/products"
            params={params as Record<string, string | undefined>}
          />
        </div>
      </div>
    </div>
  );
}
