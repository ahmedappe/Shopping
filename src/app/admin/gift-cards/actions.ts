"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAdminOrNull, getManagerOrNull } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { posError } from "@/lib/pos";
import type { ActionResult } from "@/lib/types";

const id = z.string().uuid();
const amt = z.number().positive().max(10_000_000);

export async function issueCard(outletId: string, amount: number, code: string, holder: string): Promise<ActionResult & { code?: string }> {
  if (!(await getManagerOrNull())) return { ok: false, error: "Only managers can issue gift cards." };
  const p = z.object({ o: id, a: amt, c: z.string().trim().max(20), h: z.string().trim().max(120) }).safeParse({ o: outletId, a: amount, c: code, h: holder });
  if (!p.success) return { ok: false, error: "Enter the card amount." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("gift_card_issue", { p_outlet: p.data.o, p_amount: p.data.a, p_code: p.data.c || null, p_holder: p.data.h || null });
  if (error) return { ok: false, error: posError(error.message) };
  revalidatePath("/admin/gift-cards");
  return { ok: true, code: data as string };
}

export async function topUpCard(outletId: string, code: string, amount: number): Promise<ActionResult> {
  if (!(await getManagerOrNull())) return { ok: false, error: "Only managers can top up gift cards." };
  const p = z.object({ o: id, c: z.string().trim().min(4).max(20), a: amt }).safeParse({ o: outletId, c: code, a: amount });
  if (!p.success) return { ok: false, error: "Enter the top-up amount." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("gift_card_top_up", { p_outlet: p.data.o, p_code: p.data.c, p_amount: p.data.a });
  if (error) return { ok: false, error: posError(error.message) };
  revalidatePath("/admin/gift-cards");
  return { ok: true };
}

export async function voidCard(outletId: string, code: string): Promise<ActionResult> {
  if (!(await getManagerOrNull())) return { ok: false, error: "Only managers can cancel gift cards." };
  const p = z.object({ o: id, c: z.string().trim().min(4).max(20) }).safeParse({ o: outletId, c: code });
  if (!p.success) return { ok: false, error: "Check the card." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("gift_card_void", { p_outlet: p.data.o, p_code: p.data.c });
  if (error) return { ok: false, error: posError(error.message) };
  revalidatePath("/admin/gift-cards");
  return { ok: true };
}

/** rate 0 (or empty) removes the currency. */
export async function setRate(outletId: string, code: string, rate: number): Promise<ActionResult> {
  if (!(await getManagerOrNull())) return { ok: false, error: "Only managers can change exchange rates." };
  const p = z.object({ o: id, c: z.string().trim().length(3), r: z.number().min(0).max(1_000_000) }).safeParse({ o: outletId, c: code, r: rate });
  if (!p.success) return { ok: false, error: "Use a 3-letter code like USD and a rate." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("pos_set_rate", { p_outlet: p.data.o, p_code: p.data.c, p_rate: p.data.r });
  if (error) return { ok: false, error: posError(error.message) };
  revalidatePath("/admin/gift-cards");
  return { ok: true };
}

export async function setRequireSession(outletId: string, on: boolean): Promise<ActionResult> {
  if (!(await getAdminOrNull())) return { ok: false, error: "Only an admin can change this." };
  const p = z.object({ o: id, on: z.boolean() }).safeParse({ o: outletId, on });
  if (!p.success) return { ok: false, error: "Check the setting." };
  const supabase = await createClient();
  const { error } = await supabase.from("outlets").update({ require_cash_session: p.data.on }).eq("id", p.data.o);
  if (error) return { ok: false, error: "Could not save." };
  revalidatePath("/admin/gift-cards");
  return { ok: true };
}
