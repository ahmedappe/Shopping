"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCatalogEditorOrNull } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { posError } from "@/lib/pos";
import type { ActionResult } from "@/lib/types";

const entry = z.object({
  variantId: z.string().uuid(),
  qty: z.number().int().min(0).max(10000),
  kind: z.enum(["made", "undo_made", "wasted", "set"]),
});

/** Saves one or more production entries. Stops at the first failure and says which item. */
export async function recordProduction(outletId: string, entries: { variantId: string; qty: number; kind: "made" | "undo_made" | "wasted" | "set"; label?: string }[]): Promise<ActionResult> {
  if (!(await getCatalogEditorOrNull())) return { ok: false, error: "Not authorised." };
  const o = z.string().uuid().safeParse(outletId);
  const list = z.array(entry).min(1).max(40).safeParse(entries);
  if (!o.success || !list.success) return { ok: false, error: "Check the quantities." };
  const supabase = await createClient();
  for (let i = 0; i < list.data.length; i++) {
    const e = list.data[i];
    const { error } = await supabase.rpc("pos_record_production", { p_outlet: o.data, p_variant: e.variantId, p_qty: e.qty, p_kind: e.kind });
    if (error) {
      const name = entries[i]?.label ? `${entries[i].label}: ` : "";
      return { ok: false, error: `${name}${posError(error.message)}${i > 0 ? ` (the first ${i} saved)` : ""}` };
    }
  }
  revalidatePath("/kitchen/production");
  revalidatePath("/pos");
  return { ok: true };
}
