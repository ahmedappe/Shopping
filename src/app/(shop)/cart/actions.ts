"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOutlet } from "@/lib/outlet";

const idsSchema = z.array(z.string().uuid()).max(50);

/** Returns current price & stock (at this outlet) for cart variants so the cart never shows stale data. */
export async function quoteCart(variantIds: string[]) {
  const parsed = idsSchema.safeParse(variantIds);
  if (!parsed.success || parsed.data.length === 0) return {};

  const { outlet } = await getCurrentOutlet();
  const result: Record<string, { price: number; stock: number; available: boolean }> = {};
  for (const id of parsed.data) result[id] = { price: 0, stock: 0, available: false };
  if (!outlet) return result;

  const supabase = await createClient();
  const { data } = await supabase
    .from("outlet_variants")
    .select("variant_id, price, stock, is_active, product_variants!inner(is_active, products!inner(is_active))")
    .eq("outlet_id", outlet.id)
    .in("variant_id", parsed.data);

  for (const row of (data ?? []) as unknown as {
    variant_id: string;
    price: number;
    stock: number;
    is_active: boolean;
    product_variants: { is_active: boolean; products: { is_active: boolean } };
  }[]) {
    result[row.variant_id] = {
      price: Number(row.price),
      stock: row.stock,
      available:
        row.is_active && row.product_variants.is_active && row.product_variants.products.is_active && row.stock > 0,
    };
  }
  return result;
}
