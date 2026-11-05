"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCatalogEditorOrNull } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { posError } from "@/lib/pos";
import type { ActionResult } from "@/lib/types";

const id = z.string().uuid();

async function guard() {
  return getCatalogEditorOrNull();
}

export async function openOrder(input: {
  outletId: string;
  tableId: string | null;
  type: "dine_in" | "take_away" | "delivery";
  guest?: string;
}): Promise<ActionResult & { orderId?: string }> {
  if (!(await guard())) return { ok: false, error: "Not authorised." };
  const p = z
    .object({ outletId: id, tableId: id.nullable(), type: z.enum(["dine_in", "take_away", "delivery"]), guest: z.string().trim().max(120).optional() })
    .safeParse(input);
  if (!p.success) return { ok: false, error: "Check the order details." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("pos_open_order", {
    p_outlet: p.data.outletId,
    p_table: p.data.tableId,
    p_type: p.data.type,
    p_guest: p.data.guest || null,
    p_note: null,
  });
  if (error) return { ok: false, error: posError(error.message) };
  revalidatePath("/pos");
  return { ok: true, orderId: data as string };
}

export async function addItems(orderId: string, lines: { variantId: string; quantity: number; note?: string }[]): Promise<ActionResult> {
  if (!(await guard())) return { ok: false, error: "Not authorised." };
  const p = z
    .object({
      orderId: id,
      lines: z.array(z.object({ variantId: id, quantity: z.number().int().min(1).max(999), note: z.string().trim().max(200).optional() })).min(1).max(100),
    })
    .safeParse({ orderId, lines });
  if (!p.success) return { ok: false, error: "Check the items." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("pos_add_items", {
    p_order: p.data.orderId,
    p_lines: p.data.lines.map((l) => ({ variant_id: l.variantId, quantity: l.quantity, note: l.note ?? null })),
  });
  if (error) return { ok: false, error: posError(error.message) };
  revalidatePath(`/pos/order/${orderId}`);
  return { ok: true, message: "Sent." };
}

export async function setItemStatus(itemId: string, status: "new" | "preparing" | "ready" | "served"): Promise<ActionResult> {
  if (!(await guard())) return { ok: false, error: "Not authorised." };
  if (!id.safeParse(itemId).success) return { ok: false, error: "Invalid item." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("pos_set_item_status", { p_item: itemId, p_status: status });
  if (error) return { ok: false, error: posError(error.message) };
  return { ok: true };
}

export async function voidItem(itemId: string, reason: string): Promise<ActionResult> {
  if (!(await guard())) return { ok: false, error: "Not authorised." };
  if (!id.safeParse(itemId).success) return { ok: false, error: "Invalid item." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("pos_void_item", { p_item: itemId, p_reason: reason.trim().slice(0, 200) || null });
  if (error) return { ok: false, error: posError(error.message) };
  return { ok: true };
}

export async function cancelOrder(orderId: string, reason: string): Promise<ActionResult> {
  if (!(await guard())) return { ok: false, error: "Not authorised." };
  if (!id.safeParse(orderId).success) return { ok: false, error: "Invalid order." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("pos_cancel_order", { p_order: orderId, p_reason: reason.trim().slice(0, 200) || null });
  if (error) return { ok: false, error: posError(error.message) };
  revalidatePath("/pos");
  return { ok: true };
}

export async function closeOrder(
  orderId: string,
  discount: number,
  payments: { method: "cash" | "card" | "transfer"; amount: number; reference?: string }[],
): Promise<ActionResult> {
  if (!(await guard())) return { ok: false, error: "Not authorised." };
  const p = z
    .object({
      orderId: id,
      discount: z.number().min(0).max(1_000_000),
      payments: z
        .array(z.object({ method: z.enum(["cash", "card", "transfer"]), amount: z.number().positive().max(10_000_000), reference: z.string().trim().max(80).optional() }))
        .min(1)
        .max(10),
    })
    .safeParse({ orderId, discount, payments });
  if (!p.success) return { ok: false, error: "Check the payment." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("pos_close_order", {
    p_order: p.data.orderId,
    p_discount: p.data.discount,
    p_payments: p.data.payments,
  });
  if (error) return { ok: false, error: posError(error.message) };
  revalidatePath("/pos");
  return { ok: true };
}

export async function resolveRequest(requestId: string): Promise<ActionResult> {
  if (!(await guard())) return { ok: false, error: "Not authorised." };
  if (!id.safeParse(requestId).success) return { ok: false, error: "Invalid request." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("pos_resolve_request", { p_request: requestId });
  if (error) return { ok: false, error: posError(error.message) };
  return { ok: true };
}
