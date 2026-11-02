import Image from "next/image";
import Link from "next/link";
import { ImageOff } from "lucide-react";
import type { ProductListing } from "@/lib/types";
import { formatPrice } from "@/lib/utils";
import { productImageUrl } from "@/lib/storage";

export function ProductCard({ product, priority = false }: { product: ProductListing; priority?: boolean }) {
  const img = productImageUrl(product.image_path);
  const soldOut = product.total_stock <= 0;
  const onSale = product.compare_at_price != null && Number(product.compare_at_price) > Number(product.min_price);

  return (
    <Link href={`/products/${product.slug}`} className="group block">
      <div className="relative aspect-[4/5] overflow-hidden rounded-xl bg-zinc-100">
        {img ? (
          <Image
            src={img}
            alt={product.name}
            fill
            priority={priority}
            sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
            className="object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="grid h-full place-items-center text-zinc-400">
            <ImageOff className="size-8" />
          </div>
        )}
        <div className="absolute top-2 left-2 flex gap-1.5">
          {soldOut && <span className="rounded-full bg-zinc-900 px-2.5 py-1 text-xs font-semibold text-white">Sold out</span>}
          {!soldOut && onSale && (
            <span className="rounded-full bg-red-600 px-2.5 py-1 text-xs font-semibold text-white">Sale</span>
          )}
        </div>
      </div>
      <div className="mt-3 space-y-1">
        {product.category_name && <p className="text-xs text-zinc-500">{product.category_name}</p>}
        <h3 className="line-clamp-2 text-sm font-medium text-zinc-900 group-hover:underline">{product.name}</h3>
        <p className="flex items-baseline gap-2 text-sm">
          <span className="font-semibold">
            {product.min_price !== product.max_price && <span className="font-normal text-zinc-500">From </span>}
            {formatPrice(product.min_price)}
          </span>
          {onSale && <span className="text-xs text-zinc-400 line-through">{formatPrice(product.compare_at_price)}</span>}
        </p>
      </div>
    </Link>
  );
}

export function ProductGrid({ products }: { products: ProductListing[] }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
      {products.map((p, i) => (
        <ProductCard key={p.id} product={p} priority={i < 4} />
      ))}
    </div>
  );
}
