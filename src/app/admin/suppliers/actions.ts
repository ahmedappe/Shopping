"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getManagerOrNull } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types";

const supplierSchema = z.object({
  companyId: z.string().uuid("Choose the company."),
  name: z.string().trim().min(2, "Enter the supplier name.").max(120),
  contactName: z.string().trim().max(120),
  phone: z.string().trim().max(30),
  email: z.union([z.literal(""), z.string().trim().email("Email is not valid.").max(200)]),
  gstNumber: z.string().trim().max(40),
  notes: z.string().trim().max(1000),
  isActive: z.boolean(),
});

export async function saveSupplier(id: string | null, input: unknown): Promise<ActionResult> {
  if (!(await getManagerOrNull())) return { ok: false, error: "Only managers and admins can edit suppliers." };
  if (id && !z.string().uuid().safeParse(id).success) return { ok: false, error: "Invalid supplier." };
  const parsed = supplierSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
  const d = parsed.data;

  const row = {
    company_id: d.companyId,
    name: d.name,
    contact_name: d.contactName || null,
    phone: d.phone || null,
    email: d.email || null,
    gst_number: d.gstNumber || null,
    notes: d.notes || null,
    is_active: d.isActive,
  };
  const supabase = await createClient();
  const { error } = id ? await supabase.from("suppliers").update(row).eq("id", id) : await supabase.from("suppliers").insert(row);
  if (error) {
    if (error.code === "23505") return { ok: false, error: "This company already has a supplier with that name." };
    return { ok: false, error: "Could not save. You may not have access to this company." };
  }
  revalidatePath("/admin/suppliers");
  return { ok: true, message: id ? "Supplier updated." : "Supplier added." };
}
