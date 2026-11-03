"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCatalogEditorOrNull } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types";

const rowSchema = z.object({
  variantId: z.string().uuid(),
  outletId: z.string().uuid(),
  sold: z.boolean(),
  price: z.coerce.number().min(0).max(10_000_000),
  stock: z.coerce.number().int().min(0).max(1_000_000),
});

/** Saves price / stock / "sold here" for each variant at each outlet the user can work in. */
export async function saveOutletPricing(productId: string, rows: unknown): Promise<ActionResult> {
  const user = await getCatalogEditorOrNull();
  if (!user) return { ok: false, error: "Not authorised." };
  const parsed = z.array(rowSchema).max(2000).safeParse(rows);
  if (!parsed.success || !z.string().uuid().safeParse(productId).success) {
    return { ok: false, error: "Some prices or stock numbers are not valid." };
  }

  const allowed = new Set(user.outletIds);
  const data = parsed.data.filter((r) => allowed.has(r.outletId));
  if (data.length !== parsed.data.length) return { ok: false, error: "You don't have access to one of these outlets." };

  const supabase = await createClient();
  // Only variants that really belong to this product.
  const { data: variants } = await supabase.from("product_variants").select("id").eq("product_id", productId);
  const valid = new Set((variants ?? []).map((v) => v.id as string));
  if (data.some((r) => !valid.has(r.variantId))) return { ok: false, error: "Invalid variant." };

  const { error } = await supabase.from("outlet_variants").upsert(
    data.map((r) => ({
      outlet_id: r.outletId,
      variant_id: r.variantId,
      price: r.price,
      stock: r.stock,
      is_active: r.sold,
    })),
    { onConflict: "outlet_id,variant_id" },
  );
  if (error) return { ok: false, error: "Could not save outlet prices." };

  revalidatePath(`/admin/products/${productId}`);
  revalidatePath("/admin/stock");
  revalidatePath("/", "layout");
  return { ok: true, message: "Outlet prices and stock saved." };
}
