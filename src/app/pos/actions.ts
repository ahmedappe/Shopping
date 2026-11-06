"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCatalogEditorOrNull } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { posError } from "@/lib/pos";
import { sanitizeSearch } from "@/lib/utils";
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
  payments: { method: "cash" | "card" | "transfer" | "gift_card" | "points" | "credit"; amount?: number; points?: number; currency?: string; foreignAmount?: number; reference?: string }[],
): Promise<ActionResult> {
  if (!(await guard())) return { ok: false, error: "Not authorised." };
  const p = z
    .object({
      orderId: id,
      discount: z.number().min(0).max(1_000_000),
      payments: z
        .array(z.object({ method: z.enum(["cash", "card", "transfer", "gift_card", "points", "credit"]), amount: z.number().positive().max(10_000_000).optional(), points: z.number().int().positive().max(10_000_000).optional(), currency: z.string().regex(/^[A-Z]{3}$/).optional(), foreignAmount: z.number().positive().max(10_000_000).optional(), reference: z.string().trim().max(80).optional() }).refine((x) => x.amount !== undefined || x.points !== undefined || (x.currency && x.foreignAmount !== undefined)))
        .min(1)
        .max(10),
    })
    .safeParse({ orderId, discount, payments });
  if (!p.success) return { ok: false, error: "Check the payment." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("pos_close_order", {
    p_order: p.data.orderId,
    p_discount: p.data.discount,
    p_payments: p.data.payments.map((x) => ({ method: x.method, amount: x.amount, currency: x.currency, foreign_amount: x.foreignAmount, points: x.points, reference: x.reference })),
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

export type CustomerHit = { id: string; name: string; phone: string; points: number; referralCode: string };

export async function findCustomers(outletId: string, query: string): Promise<CustomerHit[]> {
  if (!(await guard())) return [];
  const o = id.safeParse(outletId);
  const q = sanitizeSearch(query);
  if (!o.success || q.length < 2) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("outlet_customers")
    .select("id, name, phone, points_balance, referral_code")
    .eq("outlet_id", o.data)
    .or(`name.ilike.%${q}%,phone.ilike.%${q}%`)
    .order("name")
    .limit(8);
  return (data ?? []).map((c) => ({ id: c.id as string, name: c.name as string, phone: c.phone as string, points: Number(c.points_balance), referralCode: c.referral_code as string }));
}

/** Creates (or finds, by phone) a customer of this outlet and attaches them to the order. */
export async function attachCustomer(orderId: string, outletId: string, input: { customerId?: string; name?: string; phone?: string; referralCode?: string }): Promise<ActionResult> {
  if (!(await guard())) return { ok: false, error: "Not authorised." };
  const p = z
    .object({ orderId: id, outletId: id, customerId: id.optional(), name: z.string().trim().max(120).optional(), phone: z.string().trim().max(20).optional(), referralCode: z.string().trim().max(10).optional() })
    .safeParse({ orderId, outletId, ...input });
  if (!p.success) return { ok: false, error: "Check the customer details." };
  const supabase = await createClient();
  let customer = p.data.customerId;
  if (!customer) {
    const { data, error } = await supabase.rpc("customer_save", { p_outlet: p.data.outletId, p_name: p.data.name ?? "", p_phone: p.data.phone ?? "", p_referrer_code: p.data.referralCode ?? null });
    if (error) return { ok: false, error: posError(error.message) };
    customer = data as string;
  }
  const { error } = await supabase.rpc("pos_set_customer", { p_order: p.data.orderId, p_customer: customer });
  if (error) return { ok: false, error: posError(error.message) };
  revalidatePath(`/pos/order/${p.data.orderId}`);
  return { ok: true };
}

export async function detachCustomer(orderId: string): Promise<ActionResult> {
  if (!(await guard())) return { ok: false, error: "Not authorised." };
  if (!id.safeParse(orderId).success) return { ok: false, error: "Check the order." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("pos_set_customer", { p_order: orderId, p_customer: null });
  if (error) return { ok: false, error: posError(error.message) };
  revalidatePath(`/pos/order/${orderId}`);
  return { ok: true };
}

export async function assignDelivery(orderId: string, userId: string | null, address: string, status: "assigned" | "out" | "delivered"): Promise<ActionResult> {
  if (!(await guard())) return { ok: false, error: "Not authorised." };
  const p = z.object({ o: id, u: id.nullable(), a: z.string().trim().max(300), s: z.enum(["assigned", "out", "delivered"]) }).safeParse({ o: orderId, u: userId, a: address, s: status });
  if (!p.success) return { ok: false, error: "Check the delivery details." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("pos_assign_delivery", { p_order: p.data.o, p_user: p.data.u, p_address: p.data.a || null, p_status: p.data.s });
  if (error) return { ok: false, error: posError(error.message) };
  revalidatePath(`/pos/order/${p.data.o}`);
  return { ok: true };
}
