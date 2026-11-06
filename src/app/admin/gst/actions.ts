"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAdminOrNull, getCatalogEditorOrNull, getManagerOrNull } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types";

const id = z.string().uuid();
/** "" = use the outlet's default rate. */
const rate = z.union([z.literal(""), z.coerce.number().min(0).max(100)]).transform((v) => (v === "" ? null : v));

export async function setProductGst(productId: string, value: string): Promise<ActionResult> {
  if (!(await getCatalogEditorOrNull())) return { ok: false, error: "Not authorised." };
  const p = z.object({ id, v: rate }).safeParse({ id: productId, v: value });
  if (!p.success) return { ok: false, error: "Choose a GST rate." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("product_set_gst", { p_product: p.data.id, p_pct: p.data.v });
  if (error) return { ok: false, error: "Could not save." };
  revalidatePath("/admin/gst");
  revalidatePath(`/admin/products/${p.data.id}`);
  return { ok: true };
}

export async function setCategoryGst(categoryId: string, value: string): Promise<ActionResult & { count?: number }> {
  if (!(await getManagerOrNull())) return { ok: false, error: "Only managers can change GST for a whole category." };
  const p = z.object({ id, v: rate }).safeParse({ id: categoryId, v: value });
  if (!p.success) return { ok: false, error: "Choose a GST rate." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("category_set_gst", { p_category: p.data.id, p_pct: p.data.v });
  if (error) return { ok: false, error: "Could not save." };
  revalidatePath("/admin/gst");
  return { ok: true, count: Number(data) };
}

export async function setOutletGst(outletId: string, pct: number): Promise<ActionResult> {
  if (!(await getAdminOrNull())) return { ok: false, error: "Only an admin can change the outlet's default GST." };
  const p = z.object({ o: id, g: z.number().min(0).max(100) }).safeParse({ o: outletId, g: pct });
  if (!p.success) return { ok: false, error: "GST must be between 0 and 100." };
  const supabase = await createClient();
  const { error } = await supabase.from("outlets").update({ gst_pct: p.data.g }).eq("id", p.data.o);
  if (error) return { ok: false, error: "Could not save." };
  revalidatePath("/admin/gst");
  revalidatePath("/admin/reports");
  return { ok: true };
}
