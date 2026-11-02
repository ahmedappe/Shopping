"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ImageOff, Minus, Plus, Trash2 } from "lucide-react";
import { cartSubtotal, useCart } from "@/store/cart";
import { useHydrated } from "@/lib/use-hydrated";
import { formatPrice } from "@/lib/utils";
import { productImageUrl } from "@/lib/storage";
import { quoteCart } from "./actions";

export function CartView() {
  const hydrated = useHydrated();
  const { items, setQuantity, remove, sync } = useCart();
  const [notice, setNotice] = useState<string | null>(null);
  const synced = useRef(false);

  // Refresh prices & stock from the server once on load
  useEffect(() => {
    if (!hydrated || synced.current || items.length === 0) return;
    synced.current = true;
    const before = JSON.stringify(items.map((i) => [i.variantId, i.price, i.quantity]));
    quoteCart(items.map((i) => i.variantId)).then((updates) => {
      sync(updates);
      const after = JSON.stringify(useCart.getState().items.map((i) => [i.variantId, i.price, i.quantity]));
      if (before !== after) setNotice("Some items in your cart were updated to reflect current price or stock.");
    });
  }, [hydrated, items, sync]);

  if (!hydrated) return <div className="mt-8 h-40 animate-pulse rounded-xl bg-zinc-100" />;

  if (items.length === 0) {
    return (
      <div className="mt-8 rounded-xl border border-dashed border-zinc-300 p-12 text-center">
        <p className="font-medium">Your cart is empty</p>
        <Link href="/products" className="btn-primary mt-5">
          Continue shopping
        </Link>
      </div>
    );
  }

  const subtotal = cartSubtotal(items);

  return (
    <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_360px]">
      <div>
        {notice && (
          <p className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">{notice}</p>
        )}
        <ul className="divide-y divide-zinc-200 border-y border-zinc-200">
          {items.map((item) => {
            const img = productImageUrl(item.imagePath);
            return (
              <li key={item.variantId} className="flex gap-4 py-5">
                <Link
                  href={`/products/${item.slug}`}
                  className="relative size-24 shrink-0 overflow-hidden rounded-lg bg-zinc-100"
                >
                  {img ? (
                    <Image src={img} alt={item.name} fill sizes="96px" className="object-cover" />
                  ) : (
                    <ImageOff className="m-auto mt-9 size-6 text-zinc-400" />
                  )}
                </Link>
                <div className="flex flex-1 flex-col">
                  <div className="flex justify-between gap-4">
                    <div>
                      <Link href={`/products/${item.slug}`} className="font-medium hover:underline">
                        {item.name}
                      </Link>
                      {item.variantName && <p className="text-sm text-zinc-500">{item.variantName}</p>}
                    </div>
                    <p className="font-semibold whitespace-nowrap">{formatPrice(item.price * item.quantity)}</p>
                  </div>
                  <div className="mt-auto flex items-center justify-between pt-3">
                    <div className="flex items-center rounded-lg border border-zinc-300">
                      <button
                        type="button"
                        className="grid size-9 place-items-center disabled:opacity-30"
                        onClick={() => setQuantity(item.variantId, item.quantity - 1)}
                        disabled={item.quantity <= 1}
                        aria-label="Decrease quantity"
                      >
                        <Minus className="size-3.5" />
                      </button>
                      <span className="w-8 text-center text-sm">{item.quantity}</span>
                      <button
                        type="button"
                        className="grid size-9 place-items-center disabled:opacity-30"
                        onClick={() => setQuantity(item.variantId, item.quantity + 1)}
                        disabled={item.quantity >= Math.min(item.maxStock, 99)}
                        aria-label="Increase quantity"
                      >
                        <Plus className="size-3.5" />
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => remove(item.variantId)}
                      className="btn-ghost px-2 text-zinc-500"
                      aria-label={`Remove ${item.name}`}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <aside className="card h-fit p-6 lg:sticky lg:top-24">
        <h2 className="font-semibold">Order summary</h2>
        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-zinc-600">Subtotal</dt>
            <dd className="font-medium">{formatPrice(subtotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-zinc-600">Delivery</dt>
            <dd className="text-zinc-500">Calculated at checkout</dd>
          </div>
        </dl>
        <Link href="/checkout" className="btn-primary mt-6 w-full py-3">
          Checkout
        </Link>
        <Link href="/products" className="mt-3 block text-center text-sm text-zinc-600 hover:underline">
          Continue shopping
        </Link>
      </aside>
    </div>
  );
}
