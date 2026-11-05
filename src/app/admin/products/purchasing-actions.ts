"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCatalogEditorOrNull } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types";

const optNum = (max: number) =>
  z.union([z.literal(""), z.coerce.number().min(0).max(max)]).transform((v) => (v === "" ? null : v));
const optInt = (min: number) =>
  z.union([z.literal(""), z.coerce.number().int("Use whole numbers.").min(min).max(1_000_000)]).transform((v) => (v === "" ? null : v));

const schema = z.object({
  brand: z.string().trim().max(80),
  unit: z.string().trim().min(1, "Enter the unit (pcs, kg, box…).").max(20),
  // supplierId per company id ("" = none)
  suppliers: z.array(z.object({ companyId: z.string().uuid(), supplierId: z.union([z.literal(""), z.string().uuid()]), code: z.string().trim().max(60) })).max(20),
  variants: z
    .array(
      z.object({
        id: z.string().uuid(),
        barcode: z.union([z.literal(""), z.string().trim().regex(/^[A-Za-z0-9._-]{3,64}$/, "Barcode can only use letters, numbers, dot, dash or underscore.")]),
        cost: optNum(10_000_000),
      }),
    )
    .max(200),
  outlets: z
    .array(
      z.object({
        outletId: z.string().uuid(),
        variantId: z.string().uuid(),
        level2: optNum(10_000_000),
        level3: optNum(10_000_000),
        level4: optNum(10_000_000),
        reorderLevel: optInt(0),
        reorderQty: optInt(1),
        shelf: z.string().trim().max(40),
      }),
    )
    .max(2000),
});

export async function savePurchasing(productId: string, input: unknown): Promise<ActionResult> {
  const user = await getCatalogEditorOrNull();
  if (!user) return { ok: false, error: "Not authorised." };
  if (!z.string().uuid().safeParse(productId).success) return { ok: false, error: "Invalid product." };
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the numbers." };
  const d = parsed.data;

  const supabase = await createClient();
  const { data: variantRows } = await supabase.from("product_variants").select("id").eq("product_id", productId);
  const valid = new Set((variantRows ?? []).map((v) => v.id as string));
  if (d.variants.some((v) => !valid.has(v.id)) || d.outlets.some((o) => !valid.has(o.variantId))) {
    return { ok: false, error: "Invalid variant." };
  }
  const allowedOutlets = new Set(user.outletIds);
  if (d.outlets.some((o) => !allowedOutlets.has(o.outletId))) return { ok: false, error: "You don't have access to one of these outlets." };

  // 1. Brand and unit
  const { error: pErr } = await supabase.from("products").update({ brand: d.brand || null, unit: d.unit }).eq("id", productId);
  if (pErr) return { ok: false, error: "Could not save brand and unit." };

  // 2. Main supplier per company (RLS limits this to the user's companies)
  for (const s of d.suppliers) {
    const { data: companySuppliers } = await supabase.from("suppliers").select("id").eq("company_id", s.companyId);
    const ids = (companySuppliers ?? []).map((r) => r.id as string);
    if (ids.length) await supabase.from("product_suppliers").delete().eq("product_id", productId).in("supplier_id", ids);
    if (s.supplierId) {
      if (!ids.includes(s.supplierId)) return { ok: false, error: "That supplier belongs to another company." };
      const { error } = await supabase
        .from("product_suppliers")
        .insert({ product_id: productId, supplier_id: s.supplierId, supplier_code: s.code || null, is_main: true });
      if (error) return { ok: false, error: "Could not save the supplier." };
    }
  }

  // 3. Barcodes
  for (const v of d.variants) {
    const { error } = await supabase.from("product_variants").update({ barcode: v.barcode || null }).eq("id", v.id);
    if (error) {
      if (error.code === "23505") return { ok: false, error: `Barcode ${v.barcode} is already used by another item.` };
      return { ok: false, error: "Could not save a barcode." };
    }
  }

  // 4. Cost price — managers and admins only (the database refuses anyone else)
  if (user.canManageStore) {
    const withCost = d.variants.filter((v) => v.cost !== null);
    const noCost = d.variants.filter((v) => v.cost === null).map((v) => v.id);
    if (withCost.length) {
      const { error } = await supabase
        .from("variant_costs")
        .upsert(withCost.map((v) => ({ variant_id: v.id, cost: v.cost, updated_at: new Date().toISOString() })));
      if (error) return { ok: false, error: "Could not save cost prices." };
    }
    if (noCost.length) await supabase.from("variant_costs").delete().in("variant_id", noCost);
  }

  // 5. Price levels, reorder and shelf per outlet (only rows that already exist, i.e. items set up at that outlet)
  for (const o of d.outlets) {
    const { error } = await supabase
      .from("outlet_variants")
      .update({
        price_level2: o.level2,
        price_level3: o.level3,
        price_level4: o.level4,
        reorder_level: o.reorderLevel,
        reorder_qty: o.reorderQty,
        shelf_location: o.shelf || null,
      })
      .eq("outlet_id", o.outletId)
      .eq("variant_id", o.variantId);
    if (error) return { ok: false, error: "Could not save outlet reorder settings." };
  }

  revalidatePath(`/admin/products/${productId}`);
  revalidatePath("/admin/stock");
  revalidatePath("/admin/stock/reorder");
  return { ok: true, message: "Saved." };
}
