"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAdminOrNull } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { firstError } from "@/lib/validation";
import { slugify } from "@/lib/utils";
import type { ActionResult } from "@/lib/types";

const money = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? null : Number(v)),
  z.number().min(0).max(1_000_000).nullable(),
);

const outletSchema = z.object({
  name: z.string().trim().min(2, "Enter the outlet name.").max(80),
  slug: z
    .string()
    .trim()
    .min(2, "Enter a slug.")
    .max(60)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug can only use lowercase letters, numbers and dashes."),
  hostnames: z.array(z.string().regex(/^[a-z0-9.-]+\.[a-z]{2,}$|^localhost$/, "Domain looks wrong (use e.g. shop.example.mv).")),
  bankName: z.string().trim().max(80),
  accountName: z.string().trim().max(120),
  accountNumber: z.string().trim().max(40),
  deliveryFee: money,
  freeDeliveryThreshold: money,
  isActive: z.boolean(),
  sortOrder: z.coerce.number().int().min(0).max(1000),
});

function parseHostnames(raw: string) {
  return Array.from(
    new Set(
      raw
        .split(/[\s,]+/)
        .map((h) => h.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/:\d+$/, ""))
        .filter(Boolean),
    ),
  );
}

export async function saveOutlet(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  if (!(await getAdminOrNull())) return { ok: false, error: "Only admins can manage outlets." };

  const name = String(formData.get("name") ?? "");
  const parsed = outletSchema.safeParse({
    name,
    slug: String(formData.get("slug") ?? "") || slugify(name),
    hostnames: parseHostnames(String(formData.get("hostnames") ?? "")),
    bankName: String(formData.get("bankName") ?? ""),
    accountName: String(formData.get("accountName") ?? ""),
    accountNumber: String(formData.get("accountNumber") ?? ""),
    deliveryFee: formData.get("deliveryFee"),
    freeDeliveryThreshold: formData.get("freeDeliveryThreshold"),
    isActive: formData.get("isActive") === "on",
    sortOrder: formData.get("sortOrder") || 0,
  });
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const d = parsed.data;

  const supabase = await createClient();
  const rawId = formData.get("id");
  const id = rawId ? z.string().uuid().parse(rawId) : null;

  // A domain can open only one outlet.
  if (d.hostnames.length) {
    const { data: others } = await supabase.from("outlets").select("id, name, hostnames");
    for (const o of others ?? []) {
      if (o.id === id) continue;
      const clash = (o.hostnames as string[]).find((h) => d.hostnames.includes(h));
      if (clash) return { ok: false, error: `${clash} is already used by ${o.name}.` };
    }
  }

  const row = {
    name: d.name,
    slug: d.slug,
    hostnames: d.hostnames,
    bank_name: d.bankName || null,
    account_name: d.accountName || null,
    account_number: d.accountNumber || null,
    delivery_fee: d.deliveryFee,
    free_delivery_threshold: d.freeDeliveryThreshold,
    is_active: d.isActive,
    sort_order: d.sortOrder,
  };

  const { error } = id
    ? await supabase.from("outlets").update(row).eq("id", id)
    : await supabase.from("outlets").insert(row);

  if (error) {
    return { ok: false, error: error.code === "23505" ? "That slug is already used." : "Could not save the outlet." };
  }
  revalidatePath("/admin", "layout");
  revalidatePath("/", "layout");
  return { ok: true, message: id ? "Outlet updated." : "Outlet added." };
}
