import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { getProductBySlug, getRelatedProducts } from "@/lib/catalog";
import { productImageUrl } from "@/lib/storage";
import { ProductGallery } from "@/components/product-gallery";
import { AddToCart } from "@/components/add-to-cart";
import { ProductGrid } from "@/components/product-card";
import { STORE } from "@/config/store";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) return { title: "Product not found" };
  const image = productImageUrl(product.product_images[0]?.path);
  return {
    title: product.name,
    description: product.description?.slice(0, 160) ?? undefined,
    openGraph: { title: product.name, images: image ? [image] : undefined },
  };
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) notFound();

  const related = await getRelatedProducts(product.category_id, product.id);
  const variants = product.product_variants;
  const prices = variants.map((v) => Number(v.price));
  const minPrice = prices.length ? Math.min(...prices) : 0;
  const totalStock = variants.reduce((n, v) => n + v.stock, 0);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description ?? undefined,
    image: product.product_images.map((i) => productImageUrl(i.path)),
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: STORE.currency,
      lowPrice: minPrice,
      highPrice: prices.length ? Math.max(...prices) : 0,
      availability: totalStock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
    },
  };

  return (
    <div className="container-page py-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <nav className="mb-6 flex items-center gap-1.5 text-sm text-zinc-500" aria-label="Breadcrumb">
        <Link href="/products" className="hover:text-zinc-900">
          Shop
        </Link>
        {product.category && (
          <>
            <ChevronRight className="size-3.5" />
            <Link href={`/products?category=${product.category.slug}`} className="hover:text-zinc-900">
              {product.category.name}
            </Link>
          </>
        )}
        <ChevronRight className="size-3.5" />
        <span className="truncate text-zinc-900">{product.name}</span>
      </nav>

      <div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
        <ProductGallery
          name={product.name}
          images={product.product_images.map((i) => ({ id: i.id, url: productImageUrl(i.path)! }))}
        />

        <div>
          <h1 className="text-3xl font-bold tracking-tight">{product.name}</h1>
          <AddToCart
            product={{
              id: product.id,
              slug: product.slug,
              name: product.name,
              option1Name: product.option1_name,
              option2Name: product.option2_name,
              compareAtPrice: product.compare_at_price != null ? Number(product.compare_at_price) : null,
              imagePath: product.product_images[0]?.path ?? null,
            }}
            variants={variants.map((v) => ({
              id: v.id,
              option1: v.option1,
              option2: v.option2,
              price: Number(v.price),
              stock: v.stock,
              sku: v.sku,
            }))}
          />

          {product.description && (
            <div className="mt-10 border-t border-zinc-200 pt-8">
              <h2 className="text-sm font-semibold tracking-wide text-zinc-900 uppercase">Description</h2>
              <p className="mt-3 text-sm leading-relaxed whitespace-pre-line text-zinc-700">{product.description}</p>
            </div>
          )}
        </div>
      </div>

      {related.length > 0 && (
        <section className="mt-20">
          <h2 className="mb-6 text-xl font-bold tracking-tight">You may also like</h2>
          <ProductGrid products={related} />
        </section>
      )}
    </div>
  );
}
