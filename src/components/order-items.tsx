import Image from "next/image";
import { ImageOff } from "lucide-react";
import type { Order, OrderItem } from "@/lib/types";
import { formatPrice } from "@/lib/utils";
import { productImageUrl } from "@/lib/storage";

export function OrderItems({ order, items }: { order: Order; items: OrderItem[] }) {
  return (
    <div>
      <ul className="divide-y divide-zinc-100">
        {items.map((item) => {
          const img = productImageUrl(item.image_path);
          return (
            <li key={item.id} className="flex items-center gap-4 py-3">
              <div className="relative size-14 shrink-0 overflow-hidden rounded-lg bg-zinc-100">
                {img ? (
                  <Image src={img} alt="" fill sizes="56px" className="object-cover" />
                ) : (
                  <ImageOff className="m-auto mt-4 size-5 text-zinc-400" />
                )}
              </div>
              <div className="flex-1 text-sm">
                <p className="font-medium">{item.product_name}</p>
                <p className="text-zinc-500">
                  {item.variant_name && `${item.variant_name} · `}
                  {formatPrice(item.unit_price)} × {item.quantity}
                  {item.sku && ` · ${item.sku}`}
                </p>
              </div>
              <p className="text-sm font-semibold">{formatPrice(item.line_total)}</p>
            </li>
          );
        })}
      </ul>
      <dl className="mt-3 space-y-1.5 border-t border-zinc-200 pt-3 text-sm">
        <div className="flex justify-between">
          <dt className="text-zinc-600">Subtotal</dt>
          <dd>{formatPrice(order.subtotal)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-zinc-600">Delivery</dt>
          <dd>{Number(order.delivery_fee) === 0 ? "Free" : formatPrice(order.delivery_fee)}</dd>
        </div>
        <div className="flex justify-between text-base font-semibold">
          <dt>Total</dt>
          <dd>{formatPrice(order.total)}</dd>
        </div>
      </dl>
    </div>
  );
}
