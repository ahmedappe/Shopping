"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { processImage } from "@/lib/images";
import { SLIP_BUCKET } from "@/lib/storage";
import { friendlyDbError } from "@/lib/utils";
import type { ActionResult } from "@/lib/types";

export async function uploadPaymentSlip(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const orderId = z.string().uuid().safeParse(formData.get("orderId"));
  const file = formData.get("slip");
  if (!orderId.success) return { ok: false, error: "Invalid order." };
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Please choose an image of your receipt." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please sign in again." };

  const { data: order } = await supabase
    .from("orders")
    .select("id, status")
    .eq("id", orderId.data)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!order) return { ok: false, error: "Order not found." };
  if (!["pending", "slip_uploaded"].includes(order.status as string)) {
    return { ok: false, error: "A slip can no longer be uploaded for this order." };
  }

  let image;
  try {
    // Keep receipts legible but small
    image = await processImage(file, { maxSize: 1800, quality: 72 });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not read that image." };
  }

  const path = `${user.id}/${order.id}/${Date.now()}.webp`;
  const { error: uploadError } = await supabase.storage
    .from(SLIP_BUCKET)
    .upload(path, image.data, { contentType: "image/webp", upsert: false, cacheControl: "3600" });
  if (uploadError) {
    console.error("slip upload failed", uploadError.message);
    return { ok: false, error: "Upload failed. Please try again." };
  }

  const { error } = await supabase.rpc("submit_payment_slip", { p_order_id: order.id, p_path: path });
  if (error) return { ok: false, error: friendlyDbError(error.message) };

  revalidatePath(`/orders/${order.id}`);
  revalidatePath("/orders");
  revalidatePath("/admin/orders");
  return { ok: true, message: "Receipt uploaded. We'll verify your payment shortly." };
}
