"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { processImage } from "@/lib/images";
import { SLIP_BUCKET } from "@/lib/storage";
import { bankDetailsFor } from "@/config/store";
import { evaluateSlipText, type SlipResult } from "@/lib/slip-validation";
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
    .select("id, status, total, created_at, outlet:outlets(bank_name, account_name, account_number)")
    .eq("id", orderId.data)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!order) return { ok: false, error: "Order not found." };
  if (!["pending", "slip_uploaded"].includes(order.status as string)) {
    return { ok: false, error: "A slip can no longer be uploaded for this order." };
  }

  // --- basic receipt check (text read in the browser, judged here). Never blocks: problems are flagged for the admin. ---
  const ocrDone = formData.get("ocrStatus") === "done";
  const rawText = formData.get("ocrText");
  const ocrText = typeof rawText === "string" ? rawText.slice(0, 8000) : "";
  const bankDetails = bankDetailsFor(
    order.outlet as unknown as { bank_name: string | null; account_name: string | null; account_number: string | null } | null,
  );
  let slip: SlipResult | null = null;
  let duplicate = false;
  if (ocrDone) {
    slip = evaluateSlipText(ocrText, {
      amount: Number(order.total),
      accountNumber: bankDetails.accountNumber,
      accountName: bankDetails.accountName,
      orderCreatedAt: order.created_at as string,
    });
    if (slip.reference) {
      const { data: inUse } = await supabase.rpc("slip_reference_in_use", {
        p_order_id: order.id,
        p_bank: slip.bank,
        p_reference: slip.reference,
      });
      duplicate = inUse === true;
      if (duplicate) {
        slip.warnings.push("This receipt reference is already attached to another order.");
        slip.verdict = "review";
      }
    }
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

  const { error } = await supabase.rpc("submit_payment_slip", {
    p_order_id: order.id,
    p_path: path,
    p_bank: slip?.bank ?? null,
    p_reference: slip?.reference ?? null,
    p_amount: slip?.amount ?? null,
    p_paid_at: slip?.paidAt ?? null,
    p_verdict: slip ? (slip.verdict === "ok" ? "ok" : "review") : "unchecked",
    p_checks: slip ? { checks: { ...slip.checks, notDuplicate: !duplicate }, warnings: slip.warnings } : null,
  });
  if (error) return { ok: false, error: friendlyDbError(error.message) };

  revalidatePath(`/orders/${order.id}`);
  revalidatePath("/orders");
  revalidatePath("/admin/orders");
  return { ok: true, message: "Thank you! We've received your receipt and will confirm your payment shortly." };
}
