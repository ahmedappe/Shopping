"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAdminOrNull, getManagerOrNull } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { posError } from "@/lib/pos";
import type { ActionResult } from "@/lib/types";

const id = z.string().uuid();

export async function adjustPoints(customerId: string, points: number, reason: string): Promise<ActionResult> {
  if (!(await getManagerOrNull())) return { ok: false, error: "Only managers can adjust points." };
  const p = z.object({ c: id, p: z.number().int().min(-1_000_000).max(1_000_000).refine((n) => n !== 0), r: z.string().trim().min(3).max(200) }).safeParse({ c: customerId, p: points, r: reason });
  if (!p.success) return { ok: false, error: "Enter the points (use − to remove) and a short reason." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("loyalty_adjust", { p_customer: p.data.c, p_points: p.data.p, p_reason: p.data.r });
  if (error) return { ok: false, error: posError(error.message) };
  revalidatePath("/admin/customers");
  return { ok: true };
}

export async function saveLoyalty(outletId: string, earnPer100: number, pointValue: number, referralBonus: number): Promise<ActionResult> {
  if (!(await getAdminOrNull())) return { ok: false, error: "Only an admin can change loyalty settings." };
  const p = z
    .object({ o: id, e: z.number().min(0).max(1000), v: z.number().min(0).max(100000), b: z.number().int().min(0).max(100000) })
    .safeParse({ o: outletId, e: earnPer100, v: pointValue, b: referralBonus });
  if (!p.success) return { ok: false, error: "Check the numbers." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("loyalty_settings", { p_outlet: p.data.o, p_earn: p.data.e, p_value: p.data.v, p_bonus: p.data.b });
  if (error) return { ok: false, error: posError(error.message) };
  revalidatePath("/admin/customers");
  return { ok: true };
}
