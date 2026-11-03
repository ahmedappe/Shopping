"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCatalogEditorOrNull, getManagerOrNull } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types";

const requestSchema = z.object({
  variantId: z.string().uuid("Choose the item."),
  fromOutlet: z.string().uuid("Choose where it is coming from."),
  fromLocation: z.enum(["shop", "godown"]),
  toOutlet: z.string().uuid("Choose where it is going."),
  toLocation: z.enum(["shop", "godown"]),
  quantity: z.coerce.number().int("Quantity must be a whole number.").min(1, "Enter a quantity.").max(1_000_000),
  note: z.string().trim().max(500),
});

const MESSAGES: Record<string, string> = {
  FORBIDDEN: "You don't have access to these outlets.",
  SAME_LOCATION: "Choose two different places.",
  DIFFERENT_COMPANY: "Transfers are only allowed between outlets of the same company.",
  NO_STOCK_RECORD: "The source outlet has no stock record for this item.",
  NOT_ENOUGH_STOCK: "Not enough stock at the source to move that many.",
  ALREADY_DECIDED: "This transfer was already decided.",
  TRANSFER_NOT_FOUND: "Transfer not found.",
};

function friendly(message: string) {
  const key = Object.keys(MESSAGES).find((k) => message.includes(k));
  return key ? MESSAGES[key] : "Something went wrong. Please try again.";
}

export async function requestTransfer(input: unknown): Promise<ActionResult> {
  if (!(await getCatalogEditorOrNull())) return { ok: false, error: "Not authorised." };
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
  const d = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.rpc("request_stock_transfer", {
    p_variant_id: d.variantId,
    p_from_outlet: d.fromOutlet,
    p_from_location: d.fromLocation,
    p_to_outlet: d.toOutlet,
    p_to_location: d.toLocation,
    p_quantity: d.quantity,
    p_note: d.note || null,
  });
  if (error) return { ok: false, error: friendly(error.message) };
  revalidatePath("/admin/stock/transfers");
  return { ok: true, message: "Transfer requested. A manager or admin needs to approve it." };
}

export async function decideTransfer(id: string, approve: boolean, note?: string): Promise<ActionResult> {
  if (!(await getManagerOrNull())) return { ok: false, error: "Only managers and admins can approve transfers." };
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Invalid transfer." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("decide_stock_transfer", { p_id: id, p_approve: approve, p_note: note?.trim() || null });
  if (error) return { ok: false, error: friendly(error.message) };
  revalidatePath("/admin/stock/transfers");
  revalidatePath("/admin/stock");
  revalidatePath("/", "layout");
  return { ok: true, message: approve ? "Approved. Stock moved." : "Rejected." };
}
