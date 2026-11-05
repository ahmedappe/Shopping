"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCatalogEditorOrNull, getManagerOrNull } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types";

const id = z.string().uuid();
const fail = (e: string): ActionResult => ({ ok: false, error: e });

export async function addIngredient(input: { companyId: string; name: string; unit: string }): Promise<ActionResult> {
  if (!(await getManagerOrNull())) return fail("Only managers can add ingredients.");
  const p = z.object({ companyId: id, name: z.string().trim().min(1, "Enter a name.").max(80), unit: z.string().trim().min(1, "Enter a unit.").max(12) }).safeParse(input);
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Check the form.");
  const supabase = await createClient();
  const { error } = await supabase.from("ingredients").insert({ company_id: p.data.companyId, name: p.data.name, unit: p.data.unit });
  if (error) return fail(error.code === "23505" ? "This ingredient already exists." : "Could not add it.");
  revalidatePath("/admin/recipes");
  return { ok: true };
}

export async function adjustIngredient(outletId: string, ingredientId: string, mode: "add" | "set", qty: number): Promise<ActionResult> {
  if (!(await getCatalogEditorOrNull())) return fail("Not authorised.");
  const p = z.object({ outletId: id, ingredientId: id, mode: z.enum(["add", "set"]), qty: z.number().min(-1_000_000).max(1_000_000) }).safeParse({ outletId, ingredientId, mode, qty });
  if (!p.success) return fail("Enter a number.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("pos_adjust_ingredient", { p_outlet: p.data.outletId, p_ingredient: p.data.ingredientId, p_mode: p.data.mode, p_qty: p.data.qty });
  if (error) return fail("Could not update the stock.");
  revalidatePath("/admin/recipes");
  return { ok: true };
}

export async function setIngredientReorder(outletId: string, ingredientId: string, level: number | null): Promise<ActionResult> {
  if (!(await getManagerOrNull())) return fail("Only managers can set reorder levels.");
  const p = z.object({ outletId: id, ingredientId: id, level: z.number().min(0).max(1_000_000).nullable() }).safeParse({ outletId, ingredientId, level });
  if (!p.success) return fail("Enter a number.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("pos_set_ingredient_reorder", { p_outlet: p.data.outletId, p_ingredient: p.data.ingredientId, p_level: p.data.level });
  if (error) return fail("Could not save.");
  revalidatePath("/admin/recipes");
  return { ok: true };
}

export async function saveRecipe(variantId: string, lines: { ingredientId: string; qty: number }[]): Promise<ActionResult> {
  if (!(await getManagerOrNull())) return fail("Only managers can edit recipes.");
  const p = z
    .object({ variantId: id, lines: z.array(z.object({ ingredientId: id, qty: z.number().positive("Each quantity must be more than 0.").max(1_000_000) })).max(60) })
    .safeParse({ variantId, lines });
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Check the recipe.");
  const unique = new Map(p.data.lines.map((l) => [l.ingredientId, l.qty]));
  const supabase = await createClient();
  const { error: delErr } = await supabase.from("recipe_lines").delete().eq("variant_id", p.data.variantId);
  if (delErr) return fail("Could not save the recipe.");
  if (unique.size) {
    const { error } = await supabase.from("recipe_lines").insert([...unique].map(([ingredient_id, qty]) => ({ variant_id: p.data.variantId, ingredient_id, qty })));
    if (error) return fail("Could not save the recipe.");
  }
  revalidatePath("/admin/recipes");
  return { ok: true };
}
