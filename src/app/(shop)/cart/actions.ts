"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const idsSchema = z.array(z.string().uuid()).max(50);

/** Returns current price & stock for cart variants so the cart never shows stale data. */
export async function quoteCart(variantIds: string[]) {
  const parsed = idsSchema.safeParse(variantIds);
  if (!parsed.success || parsed.data.length === 0) return {};

  const supabase = await createClient();
  const { data } = await supabase
    .from("product_variants")
    .select("id, price, stock, is_active, products!inner(is_active)")
    .in("id", parsed.data);

  const result: Record<string, { price: number; stock: number; available: boolean }> = {};
  for (const id of parsed.data) result[id] = { price: 0, stock: 0, available: false };
  for (const row of (data ?? []) as unknown as {
    id: string;
    price: number;
    stock: number;
    is_active: boolean;
    products: { is_active: boolean };
  }[]) {
    result[row.id] = {
      price: Number(row.price),
      stock: row.stock,
      available: row.is_active && row.products.is_active && row.stock > 0,
    };
  }
  return result;
}
