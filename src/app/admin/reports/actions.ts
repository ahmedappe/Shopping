"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAdminOrNull } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types";

export async function saveGst(outletId: string, pct: number): Promise<ActionResult> {
  if (!(await getAdminOrNull())) return { ok: false, error: "Only an admin can change GST." };
  const p = z.object({ o: z.string().uuid(), g: z.number().min(0).max(100) }).safeParse({ o: outletId, g: pct });
  if (!p.success) return { ok: false, error: "GST must be between 0 and 100." };
  const supabase = await createClient();
  const { error } = await supabase.from("outlets").update({ gst_pct: p.data.g }).eq("id", p.data.o);
  if (error) return { ok: false, error: "Could not save." };
  revalidatePath("/admin/reports");
  return { ok: true };
}
