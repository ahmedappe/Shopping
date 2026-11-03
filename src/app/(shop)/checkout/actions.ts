"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { checkoutSchema, firstError } from "@/lib/validation";
import { friendlyDbError } from "@/lib/utils";
import { getCurrentOutlet } from "@/lib/outlet";

export type PlaceOrderResult = { ok: true; orderId: string } | { ok: false; error: string };

export async function placeOrder(input: unknown): Promise<PlaceOrderResult> {
  const parsed = checkoutSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please sign in to place your order." };

  // The outlet comes from the domain the customer is on — never from the browser.
  const { outlet } = await getCurrentOutlet();
  if (!outlet) return { ok: false, error: "This store is not open for orders right now." };

  const d = parsed.data;
  // Prices and totals are computed inside the database function — never from client data.
  const { data, error } = await supabase.rpc("place_order", {
    p_items: d.items.map((i) => ({ variant_id: i.variantId, quantity: i.quantity })),
    p_customer_name: d.customerName,
    p_phone: d.phone,
    p_email: d.email || user.email || "",
    p_address: d.address,
    p_city: d.city,
    p_notes: d.notes,
    p_outlet_id: outlet.id,
  });

  if (error || !data) {
    console.error("place_order failed", error?.message);
    return { ok: false, error: friendlyDbError(error?.message) };
  }

  // Remember contact details for next time (only allowed columns are writable)
  await supabase.from("profiles").update({ full_name: d.customerName, phone: d.phone }).eq("id", user.id);

  revalidatePath("/orders");
  revalidatePath("/admin");
  return { ok: true, orderId: data as string };
}
