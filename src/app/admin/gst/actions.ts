"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAdminOrNull, getCatalogEditorOrNull, getManagerOrNull } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types";

const id = z.string().uuid();

export async function setProductGst(productId: string, taxable: boolean): Promise<ActionResult> {
  if (!(await getCatalogEditorOrNull())) return { ok: false, error: "Not authorised." };
  const p = z.object({ id, v: z.boolean() }).safeParse({ id: productId, v: taxable });
  if (!p.success) return { ok: false, error: "Choose taxable or 0%." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("product_set_gst", { p_product: p.data.id, p_taxable: p.data.v });
  if (error) return { ok: false, error: "Could not save." };
  revalidatePath("/admin/gst");
  revalidatePath(`/admin/products/${p.data.id}`);
  return { ok: true };
}

export async function setCategoryGst(categoryId: string, taxable: boolean): Promise<ActionResult & { count?: number }> {
  if (!(await getManagerOrNull())) return { ok: false, error: "Only managers can change GST for a whole category." };
  const p = z.object({ id, v: z.boolean() }).safeParse({ id: categoryId, v: taxable });
  if (!p.success) return { ok: false, error: "Choose a GST rate." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("category_set_gst", { p_category: p.data.id, p_taxable: p.data.v });
  if (error) return { ok: false, error: "Could not save." };
  revalidatePath("/admin/gst");
  return { ok: true, count: Number(data) };
}

export async function setOutletSector(outletId: string, sector: "general" | "tourism"): Promise<ActionResult> {
  if (!(await getAdminOrNull())) return { ok: false, error: "Only an admin can change the outlet's sector." };
  const p = z.object({ o: id, s: z.enum(["general", "tourism"]) }).safeParse({ o: outletId, s: sector });
  if (!p.success) return { ok: false, error: "Choose general or tourism." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("outlet_set_sector", { p_outlet: p.data.o, p_sector: p.data.s });
  if (error) return { ok: false, error: "Could not save." };
  revalidatePath("/admin/gst");
  revalidatePath("/admin/reports");
  return { ok: true };
}
