"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCatalogEditorOrNull } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { posError } from "@/lib/pos";
import type { ActionResult } from "@/lib/types";

const id = z.string().uuid();
const money = z.number().min(0).max(10_000_000);

export async function openDrawer(outletId: string, openingFloat: number): Promise<ActionResult> {
  if (!(await getCatalogEditorOrNull())) return { ok: false, error: "Not authorised." };
  const p = z.object({ outletId: id, f: money }).safeParse({ outletId, f: openingFloat });
  if (!p.success) return { ok: false, error: "Enter the starting cash amount." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("cash_open", { p_outlet: p.data.outletId, p_float: p.data.f });
  if (error) return { ok: false, error: posError(error.message) };
  revalidatePath("/pos/cash");
  revalidatePath("/pos");
  return { ok: true };
}

export async function cashMovement(sessionId: string, kind: "pay_in" | "pay_out", amount: number, reason: string): Promise<ActionResult> {
  if (!(await getCatalogEditorOrNull())) return { ok: false, error: "Not authorised." };
  const p = z.object({ s: id, kind: z.enum(["pay_in", "pay_out"]), a: money.refine((n) => n > 0), r: z.string().trim().min(3).max(200) }).safeParse({ s: sessionId, kind, a: amount, r: reason });
  if (!p.success) return { ok: false, error: "Enter an amount and a short reason." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("cash_movement", { p_session: p.data.s, p_kind: p.data.kind, p_amount: p.data.a, p_reason: p.data.r });
  if (error) return { ok: false, error: posError(error.message) };
  revalidatePath("/pos/cash");
  return { ok: true };
}

export async function closeDrawer(sessionId: string, counted: number, note: string): Promise<ActionResult & { variance?: number }> {
  if (!(await getCatalogEditorOrNull())) return { ok: false, error: "Not authorised." };
  const p = z.object({ s: id, c: money, n: z.string().trim().max(300) }).safeParse({ s: sessionId, c: counted, n: note });
  if (!p.success) return { ok: false, error: "Enter the cash you counted." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cash_close", { p_session: p.data.s, p_counted: p.data.c, p_note: p.data.n });
  if (error) return { ok: false, error: posError(error.message) };
  revalidatePath("/pos/cash");
  revalidatePath("/pos");
  return { ok: true, variance: Number(data) };
}
