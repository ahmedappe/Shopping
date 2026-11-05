"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAdminOrNull, getCatalogEditorOrNull, getManagerOrNull } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types";

const id = z.string().uuid();

export async function saveOutletPos(input: { outletId: string; serviceChargePct: number; header: string; footer: string }): Promise<ActionResult> {
  if (!(await getAdminOrNull())) return { ok: false, error: "Only an admin can change these." };
  const p = z
    .object({ outletId: id, serviceChargePct: z.number().min(0).max(100), header: z.string().trim().max(300), footer: z.string().trim().max(300) })
    .safeParse(input);
  if (!p.success) return { ok: false, error: "Service charge must be between 0 and 100." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("outlets")
    .update({ service_charge_pct: p.data.serviceChargePct, receipt_header: p.data.header || null, receipt_footer: p.data.footer || null })
    .eq("id", p.data.outletId);
  if (error) return { ok: false, error: "Could not save." };
  revalidatePath("/admin/pos-setup");
  return { ok: true, message: "Saved." };
}

export async function addTable(input: { outletId: string; name: string; seats: number }): Promise<ActionResult> {
  if (!(await getManagerOrNull())) return { ok: false, error: "Only managers can change tables." };
  const p = z.object({ outletId: id, name: z.string().trim().min(1, "Enter a table name.").max(30), seats: z.number().int().min(1).max(100) }).safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Check the table." };
  const supabase = await createClient();
  const { count } = await supabase.from("dining_tables").select("id", { count: "exact", head: true }).eq("outlet_id", p.data.outletId);
  const { error } = await supabase.from("dining_tables").insert({ outlet_id: p.data.outletId, name: p.data.name, seats: p.data.seats, sort_order: count ?? 0 });
  if (error) return { ok: false, error: error.code === "23505" ? "A table with this name already exists." : "Could not add the table." };
  revalidatePath("/admin/pos-setup");
  return { ok: true };
}

export async function updateTable(tableId: string, patch: { name?: string; seats?: number; isActive?: boolean }): Promise<ActionResult> {
  if (!(await getManagerOrNull())) return { ok: false, error: "Only managers can change tables." };
  const p = z
    .object({ tableId: id, name: z.string().trim().min(1).max(30).optional(), seats: z.number().int().min(1).max(100).optional(), isActive: z.boolean().optional() })
    .safeParse({ tableId, ...patch });
  if (!p.success) return { ok: false, error: "Check the table." };
  const update: Record<string, unknown> = {};
  if (p.data.name !== undefined) update.name = p.data.name;
  if (p.data.seats !== undefined) update.seats = p.data.seats;
  if (p.data.isActive !== undefined) update.is_active = p.data.isActive;
  const supabase = await createClient();
  const { error } = await supabase.from("dining_tables").update(update).eq("id", p.data.tableId);
  if (error) return { ok: false, error: error.code === "23505" ? "A table with this name already exists." : "Could not save." };
  revalidatePath("/admin/pos-setup");
  return { ok: true };
}

export async function setStation(outletId: string, variantId: string, station: "kitchen" | "bar" | null): Promise<ActionResult> {
  if (!(await getCatalogEditorOrNull())) return { ok: false, error: "Not authorised." };
  const p = z.object({ outletId: id, variantId: id, station: z.enum(["kitchen", "bar"]).nullable() }).safeParse({ outletId, variantId, station });
  if (!p.success) return { ok: false, error: "Invalid." };
  const supabase = await createClient();
  const { error } = await supabase.from("outlet_variants").update({ station: p.data.station }).eq("outlet_id", p.data.outletId).eq("variant_id", p.data.variantId);
  if (error) return { ok: false, error: "Could not save." };
  return { ok: true };
}
