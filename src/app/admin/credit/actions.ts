"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCatalogEditorOrNull, getManagerOrNull } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { posError } from "@/lib/pos";
import type { ActionResult } from "@/lib/types";

const id = z.string().uuid();

export async function receivePayment(customerId: string, amount: number, method: "cash" | "card" | "transfer", reference: string): Promise<ActionResult> {
  if (!(await getCatalogEditorOrNull())) return { ok: false, error: "Not authorised." };
  const p = z.object({ c: id, a: z.number().positive().max(10_000_000), m: z.enum(["cash", "card", "transfer"]), r: z.string().trim().max(80) }).safeParse({ c: customerId, a: amount, m: method, r: reference });
  if (!p.success) return { ok: false, error: "Enter the amount received." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("customer_receive_payment", { p_customer: p.data.c, p_amount: p.data.a, p_method: p.data.m, p_reference: p.data.r || null });
  if (error) return { ok: false, error: posError(error.message) };
  revalidatePath("/admin/credit");
  return { ok: true };
}

export async function setCreditLimit(customerId: string, limit: number): Promise<ActionResult> {
  if (!(await getManagerOrNull())) return { ok: false, error: "Only managers can set credit limits." };
  const p = z.object({ c: id, l: z.number().min(0).max(10_000_000) }).safeParse({ c: customerId, l: limit });
  if (!p.success) return { ok: false, error: "Enter a limit (0 = no credit)." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("customer_set_credit", { p_customer: p.data.c, p_limit: p.data.l });
  if (error) return { ok: false, error: posError(error.message) };
  revalidatePath("/admin/credit");
  revalidatePath("/admin/customers");
  return { ok: true };
}
