"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getManagerOrNull } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { friendlyDbError } from "@/lib/utils";
import type { ActionResult } from "@/lib/types";

const schema = z.object({
  orderId: z.string().uuid(),
  status: z.enum(["pending", "approved", "delivered", "rejected"]),
  note: z.string().trim().max(1000).optional(),
  collectionLocation: z.string().trim().min(1).max(100).optional(),
});

export async function setOrderStatus(input: unknown): Promise<ActionResult> {
  if (!(await getManagerOrNull())) return { ok: false, error: "Not authorised." };
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };

  const supabase = await createClient();
  // The database function re-checks admin rights and enforces allowed transitions.
  const { error } = await supabase.rpc("admin_set_order_status", {
    p_order_id: parsed.data.orderId,
    p_status: parsed.data.status,
    p_note: parsed.data.note ?? null,
    p_collection_location: parsed.data.status === "delivered" ? (parsed.data.collectionLocation ?? null) : null,
  });
  if (error) {
    const friendly = friendlyDbError(error.message);
    // Admins/managers get the underlying reason for unexpected failures, to make fixing them quick.
    return { ok: false, error: friendly.startsWith("Something went wrong") ? `${friendly} (${error.message})` : friendly };
  }

  revalidatePath(`/admin/orders/${parsed.data.orderId}`);
  revalidatePath("/admin/orders");
  revalidatePath("/admin");
  revalidatePath(`/orders/${parsed.data.orderId}`);
  return { ok: true, message: "Order updated." };
}
