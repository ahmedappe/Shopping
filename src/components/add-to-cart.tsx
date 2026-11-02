"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Check, Minus, Plus, ShoppingBag } from "lucide-react";
import { useCart } from "@/store/cart";
import { cn, formatPrice, variantLabel } from "@/lib/utils";
import { STORE } from "@/config/store";

type V = { id: string; option1: string | null; option2: string | null; price: number; stock: number; sku: string | null };

type P = {
  id: string;
  slug: string;
  name: string;
  option1Name: string | null;
  option2Name: string | null;
  compareAtPrice: number | null;
  imagePath: string | null;
};

const unique = (values: (string | null)[]) => [...new Set(values.filter((v): v is string => Boolean(v)))];

export function AddToCart({ product, variants }: { product: P; variants: V[] }) {
  const add = useCart((s) => s.add);
  const options1 = useMemo(() => unique(variants.map((v) => v.option1)), [variants]);
  const options2 = useMemo(() => unique(variants.map((v) => v.option2)), [variants]);

  const firstInStock = variants.find((v) => v.stock > 0) ?? variants[0];
  const [opt1, setOpt1] = useState<string | null>(firstInStock?.option1 ?? null);
  const [opt2, setOpt2] = useState<string | null>(firstInStock?.option2 ?? null);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);

  const hasOpt1 = Boolean(product.option1Name) && options1.length > 0;
  const hasOpt2 = Boolean(product.option2Name) && options2.length > 0;

  const selected = variants.find(
    (v) => (!hasOpt1 || v.option1 === opt1) && (!hasOpt2 || v.option2 === opt2),
  );

  const price = selected?.price ?? Math.min(...variants.map((v) => v.price));
  const stock = selected?.stock ?? 0;
  const onSale = product.compareAtPrice != null && product.compareAtPrice > price;

  function handleAdd() {
    if (!selected || selected.stock <= 0) return;
    add(
      {
        variantId: selected.id,
        productId: product.id,
        slug: product.slug,
        name: product.name,
        variantName: variantLabel(selected),
        price: selected.price,
        imagePath: product.imagePath,
        maxStock: selected.stock,
      },
      qty,
    );
    setAdded(true);
    setTimeout(() => setAdded(false), 2500);
  }

  if (variants.length === 0) {
    return <p className="mt-6 text-zinc-500">This product is currently unavailable.</p>;
  }

  return (
    <div>
      <div className="mt-4 flex items-baseline gap-3">
        <span className="text-2xl font-semibold">{formatPrice(price)}</span>
        {onSale && <span className="text-zinc-400 line-through">{formatPrice(product.compareAtPrice)}</span>}
      </div>

      <div className="mt-8 space-y-6">
        {hasOpt1 && (
          <OptionGroup
            label={product.option1Name!}
            values={options1}
            selected={opt1}
            isAvailable={(v) => variants.some((x) => x.option1 === v && x.stock > 0)}
            onSelect={(v) => {
              setOpt1(v);
              setQty(1);
              if (hasOpt2 && !variants.some((x) => x.option1 === v && x.option2 === opt2)) {
                setOpt2(variants.find((x) => x.option1 === v)?.option2 ?? null);
              }
            }}
          />
        )}
        {hasOpt2 && (
          <OptionGroup
            label={product.option2Name!}
            values={options2}
            selected={opt2}
            isAvailable={(v) => variants.some((x) => (!hasOpt1 || x.option1 === opt1) && x.option2 === v && x.stock > 0)}
            exists={(v) => variants.some((x) => (!hasOpt1 || x.option1 === opt1) && x.option2 === v)}
            onSelect={(v) => {
              setOpt2(v);
              setQty(1);
            }}
          />
        )}

        <p className={cn("text-sm", stock > 0 ? "text-zinc-600" : "font-medium text-red-600")}>
          {!selected
            ? "This combination is not available"
            : stock <= 0
              ? "Out of stock"
              : stock <= STORE.lowStockThreshold
                ? `Only ${stock} left`
                : "In stock"}
          {selected?.sku && <span className="ml-2 text-zinc-400">SKU: {selected.sku}</span>}
        </p>

        <div className="flex gap-3">
          <div className="flex items-center rounded-lg border border-zinc-300">
            <button
              type="button"
              className="grid size-11 place-items-center disabled:opacity-30"
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              disabled={qty <= 1}
              aria-label="Decrease quantity"
            >
              <Minus className="size-4" />
            </button>
            <span className="w-8 text-center text-sm font-medium" aria-live="polite">
              {qty}
            </span>
            <button
              type="button"
              className="grid size-11 place-items-center disabled:opacity-30"
              onClick={() => setQty((q) => Math.min(Math.min(stock, 99), q + 1))}
              disabled={qty >= Math.min(stock, 99)}
              aria-label="Increase quantity"
            >
              <Plus className="size-4" />
            </button>
          </div>
          <button
            type="button"
            className="btn-primary flex-1 py-3"
            onClick={handleAdd}
            disabled={!selected || stock <= 0}
          >
            {added ? <Check className="size-4" /> : <ShoppingBag className="size-4" />}
            {added ? "Added to cart" : stock > 0 ? "Add to cart" : "Sold out"}
          </button>
        </div>
        {added && (
          <Link href="/cart" className="btn-outline w-full">
            View cart & checkout
          </Link>
        )}
      </div>
    </div>
  );
}

function OptionGroup({
  label,
  values,
  selected,
  onSelect,
  isAvailable,
  exists = () => true,
}: {
  label: string;
  values: string[];
  selected: string | null;
  onSelect: (v: string) => void;
  isAvailable: (v: string) => boolean;
  exists?: (v: string) => boolean;
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium">
        {label}: <span className="text-zinc-600">{selected}</span>
      </legend>
      <div className="flex flex-wrap gap-2">
        {values.map((v) => {
          const available = isAvailable(v);
          const present = exists(v);
          return (
            <button
              key={v}
              type="button"
              disabled={!present}
              onClick={() => onSelect(v)}
              aria-pressed={selected === v}
              className={cn(
                "min-w-12 rounded-lg border px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-30",
                selected === v ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-300 hover:border-zinc-900",
                !available && present && "text-zinc-400 line-through decoration-1",
                !available && present && selected === v && "text-zinc-300",
              )}
            >
              {v}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
