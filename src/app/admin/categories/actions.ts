"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCatalogEditorOrNull, getManagerOrNull } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { categorySchema, firstError } from "@/lib/validation";
import { slugify } from "@/lib/utils";
import type { ActionResult } from "@/lib/types";

function parse(formData: FormData) {
  const name = String(formData.get("name") ?? "");
  return categorySchema.safeParse({
    name,
    slug: String(formData.get("slug") ?? "") || slugify(name),
    description: String(formData.get("description") ?? ""),
    sortOrder: formData.get("sortOrder") || 0,
  });
}

function refresh() {
  revalidatePath("/admin/categories");
  revalidatePath("/", "layout");
}

export async function saveCategory(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  if (!(await getCatalogEditorOrNull())) return { ok: false, error: "Not authorised." };
  const parsed = parse(formData);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };

  const id = formData.get("id");
  const row = {
    name: parsed.data.name,
    slug: parsed.data.slug,
    description: parsed.data.description || null,
    sort_order: parsed.data.sortOrder,
  };

  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("categories").update(row).eq("id", z.string().uuid().parse(id))
    : await supabase.from("categories").insert(row);

  if (error) {
    return { ok: false, error: error.code === "23505" ? "That slug is already used." : "Could not save category." };
  }
  refresh();
  return { ok: true, message: id ? "Category updated." : "Category added." };
}

export async function deleteCategory(id: string): Promise<ActionResult> {
  if (!(await getManagerOrNull())) return { ok: false, error: "Only managers and admins can delete categories." };
  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) return { ok: false, error: "Invalid category." };

  const supabase = await createClient();
  const { error } = await supabase.from("categories").delete().eq("id", parsed.data);
  if (error) return { ok: false, error: "Could not delete category." };
  refresh();
  return { ok: true };
}
