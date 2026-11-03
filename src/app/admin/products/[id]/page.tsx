import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { z } from "zod";
import { requireCatalogEditor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getCategories } from "@/lib/catalog";
import { productImageUrl } from "@/lib/storage";
import { getAdminOutlets } from "@/lib/admin-outlets";
import { ProductForm } from "../product-form";
import { OutletPricing, type PricingCell } from "../outlet-pricing";
import { ImageManager } from "../image-manager";
import { DeleteProductButton } from "../delete-product-button";
import type { Product, ProductImage, Variant } from "@/lib/types";

export const metadata: Metadata = { title: "Edit product" };

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireCatalogEditor();
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();

  const supabase = await createClient();
  const [{ data }, categories] = await Promise.all([
    supabase
      .from("products")
      .select("*, product_variants(*), product_images(*)")
      .eq("id", id)
      .order("sort_order", { referencedTable: "product_variants" })
      .order("sort_order", { referencedTable: "product_images" })
      .maybeSingle(),
    getCategories(),
  ]);
  if (!data) notFound();
  const product = data as Product & { product_variants: Variant[]; product_images: ProductImage[] };

  const outlets = await getAdminOutlets(user);
  const variantIds = product.product_variants.map((v) => v.id);
  const { data: ovRows } =
    variantIds.length && outlets.length
      ? await supabase
          .from("outlet_variants")
          .select("outlet_id, variant_id, price, stock, godown_stock, is_active")
          .in("variant_id", variantIds)
          .in("outlet_id", outlets.map((o) => o.id))
      : { data: [] };
  const initial: Record<string, PricingCell> = {};
  for (const r of (ovRows ?? []) as { outlet_id: string; variant_id: string; price: number; stock: number; godown_stock: number; is_active: boolean }[]) {
    initial[`${r.outlet_id}:${r.variant_id}`] = { sold: r.is_active, price: String(r.price), stock: String(r.stock), godown: String(r.godown_stock) };
  }
  const defaults = Object.fromEntries(product.product_variants.map((v) => [v.id, String(v.price)]));

  return (
    <div className="max-w-4xl">
      <Link href="/admin/products" className="inline-flex items-center gap-1.5 text-sm text-zinc-600 hover:text-zinc-900">
        <ArrowLeft className="size-4" /> Products
      </Link>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">{product.name}</h1>
        {product.is_active && (
          <Link href={`/products/${product.slug}`} target="_blank" className="btn-outline">
            View in store <ExternalLink className="size-4" />
          </Link>
        )}
      </div>

      <section className="card mt-6 p-5">
        <h2 className="font-semibold">Images</h2>
        <p className="text-xs text-zinc-500">
          Up to 12 images. They&apos;re compressed and converted to WebP automatically. The first image is the main one.
        </p>
        <ImageManager
          productId={product.id}
          images={product.product_images.map((i) => ({ id: i.id, url: productImageUrl(i.path)! }))}
        />
      </section>

      <section className="card mt-6 p-5">
        <h2 className="font-semibold">Prices &amp; stock by outlet</h2>
        <p className="text-xs text-zinc-500">
          Tick &quot;Sold here&quot; for each outlet that sells this item, and set that outlet&apos;s own price and stock.
        </p>
        <OutletPricing
          productId={product.id}
          outlets={outlets}
          variants={product.product_variants.map((v) => ({ id: v.id, option1: v.option1, option2: v.option2 }))}
          initial={initial}
          defaults={defaults}
        />
      </section>

      <ProductForm
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
        product={{
          id: product.id,
          name: product.name,
          slug: product.slug,
          description: product.description ?? "",
          categoryId: product.category_id ?? "",
          compareAtPrice: product.compare_at_price != null ? String(product.compare_at_price) : "",
          option1Name: product.option1_name ?? "",
          option2Name: product.option2_name ?? "",
          isActive: product.is_active,
          isFeatured: product.is_featured,
          variants: product.product_variants.map((v) => ({
            id: v.id,
            option1: v.option1 ?? "",
            option2: v.option2 ?? "",
            sku: v.sku ?? "",
            price: String(v.price),
            stock: String(v.stock),
            isActive: v.is_active,
          })),
        }}
      />

      {user.canManageStore && (
      <section className="mt-10 rounded-xl border border-red-200 p-5">
        <h2 className="font-semibold text-red-700">Danger zone</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Deleting removes the product and its images. Past orders keep their item details. To hide it temporarily,
          untick &quot;Visible in store&quot; instead.
        </p>
        <DeleteProductButton id={product.id} name={product.name} />
      </section>
      )}
    </div>
  );
}
