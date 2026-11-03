"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCatalogEditorOrNull, getManagerOrNull } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { processImage } from "@/lib/images";
import { PRODUCT_BUCKET } from "@/lib/storage";
import { firstError, productSchema } from "@/lib/validation";
import type { ActionResult } from "@/lib/types";

const uuid = z.string().uuid();

function refreshProduct(slug?: string) {
  revalidatePath("/admin/products");
  revalidatePath("/products");
  revalidatePath("/");
  if (slug) revalidatePath(`/products/${slug}`);
}

export type SaveProductResult = { ok: true; id: string } | { ok: false; error: string };

export async function saveProduct(id: string | null, input: unknown): Promise<SaveProductResult> {
  const editor = await getCatalogEditorOrNull();
  if (!editor) return { ok: false, error: "Not authorised." };
  if (id && !uuid.safeParse(id).success) return { ok: false, error: "Invalid product." };

  const parsed = productSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const p = parsed.data;

  const supabase = await createClient();
  const row = {
    name: p.name,
    slug: p.slug,
    description: p.description || null,
    category_id: p.categoryId || null,
    compare_at_price: p.compareAtPrice === "" || p.compareAtPrice == null ? null : p.compareAtPrice,
    option1_name: p.option1Name || null,
    option2_name: p.option1Name && p.option2Name ? p.option2Name : null,
    is_active: p.isActive,
    is_featured: p.isFeatured,
  };

  let productId = id;
  if (productId) {
    const { error } = await supabase.from("products").update(row).eq("id", productId);
    if (error) return { ok: false, error: dbMessage(error.code) };
  } else {
    const { data, error } = await supabase.from("products").insert(row).select("id").single();
    if (error || !data) return { ok: false, error: dbMessage(error?.code) };
    productId = data.id as string;
  }

  // --- Sync variants: delete removed → update existing → insert new
  const { data: existing } = await supabase.from("product_variants").select("id").eq("product_id", productId);
  const existingIds = new Set((existing ?? []).map((v) => v.id as string));
  const keptIds = new Set(p.variants.filter((v) => v.id && existingIds.has(v.id)).map((v) => v.id!));
  const toDelete = [...existingIds].filter((vid) => !keptIds.has(vid));

  if (toDelete.length) {
    const { error } = await supabase.from("product_variants").delete().in("id", toDelete);
    if (error) return { ok: false, error: "Could not remove old variants." };
  }

  const toRow = (v: (typeof p.variants)[number], index: number) => ({
    product_id: productId!,
    option1: row.option1_name ? v.option1 || null : null,
    option2: row.option2_name ? v.option2 || null : null,
    sku: v.sku || null,
    price: v.price,
    stock: v.stock,
    is_active: v.isActive,
    sort_order: index,
  });

  for (const [index, v] of p.variants.entries()) {
    if (v.id && keptIds.has(v.id)) {
      const { error } = await supabase.from("product_variants").update(toRow(v, index)).eq("id", v.id);
      if (error) return { ok: false, error: dbMessage(error.code, "variant") };
    }
  }
  const inserts = p.variants
    .map((v, index) => ({ v, index }))
    .filter(({ v }) => !(v.id && keptIds.has(v.id)))
    .map(({ v, index }) => toRow(v, index));
  if (inserts.length) {
    const { data: created, error } = await supabase.from("product_variants").insert(inserts).select("id, price, stock");
    if (error) return { ok: false, error: dbMessage(error.code, "variant") };

    // New variants start out sold at every outlet this person works in (default price, entered stock).
    // Other outlets can switch them on from the product page.
    if (created?.length && editor.outletIds.length) {
      const { error: ovError } = await supabase.from("outlet_variants").upsert(
        created.flatMap((c) =>
          editor.outletIds.map((outletId) => ({
            outlet_id: outletId,
            variant_id: c.id as string,
            price: c.price as number,
            stock: c.stock as number,
            is_active: true,
          })),
        ),
        { onConflict: "outlet_id,variant_id" },
      );
      if (ovError) return { ok: false, error: "Saved the product but could not add it to your outlets." };
    }
  }

  refreshProduct(p.slug);
  return { ok: true, id: productId! };
}

function dbMessage(code?: string, what: "product" | "variant" = "product") {
  if (code === "23505") return what === "variant" ? "A SKU is already used by another variant." : "That slug is already used by another product.";
  if (code === "23514") return "Some values are out of range.";
  return `Could not save ${what}. Please try again.`;
}

export async function deleteProduct(id: string): Promise<ActionResult> {
  if (!(await getManagerOrNull())) return { ok: false, error: "Only managers and admins can delete products." };
  if (!uuid.safeParse(id).success) return { ok: false, error: "Invalid product." };

  const supabase = await createClient();
  const { data: images } = await supabase.from("product_images").select("path").eq("product_id", id);
  const { error } = await supabase.from("products").delete().eq("id", id);
  if (error) return { ok: false, error: "Could not delete product." };

  const paths = (images ?? []).map((i) => i.path as string);
  if (paths.length) await supabase.storage.from(PRODUCT_BUCKET).remove(paths);

  refreshProduct();
  return { ok: true };
}

// ---------------------------------------------------------------- images

export async function uploadProductImage(formData: FormData): Promise<ActionResult> {
  if (!(await getCatalogEditorOrNull())) return { ok: false, error: "Not authorised." };
  const productId = uuid.safeParse(formData.get("productId"));
  const file = formData.get("file");
  if (!productId.success) return { ok: false, error: "Invalid product." };
  if (!(file instanceof File)) return { ok: false, error: "No file uploaded." };

  const supabase = await createClient();
  const { count } = await supabase
    .from("product_images")
    .select("id", { count: "exact", head: true })
    .eq("product_id", productId.data);
  if ((count ?? 0) >= 12) return { ok: false, error: "Maximum 12 images per product." };

  let image;
  try {
    image = await processImage(file, { maxSize: 1600, quality: 80 });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Invalid image." };
  }

  const path = `${productId.data}/${randomUUID()}.webp`;
  const { error: uploadError } = await supabase.storage
    .from(PRODUCT_BUCKET)
    .upload(path, image.data, { contentType: "image/webp", cacheControl: "31536000", upsert: false });
  if (uploadError) return { ok: false, error: "Upload failed." };

  const { error } = await supabase.from("product_images").insert({
    product_id: productId.data,
    path,
    width: image.width,
    height: image.height,
    sort_order: count ?? 0,
  });
  if (error) {
    await supabase.storage.from(PRODUCT_BUCKET).remove([path]);
    return { ok: false, error: "Could not save image." };
  }

  revalidatePath(`/admin/products/${productId.data}`);
  refreshProduct();
  return { ok: true };
}

export async function deleteProductImage(imageId: string): Promise<ActionResult> {
  if (!(await getCatalogEditorOrNull())) return { ok: false, error: "Not authorised." };
  if (!uuid.safeParse(imageId).success) return { ok: false, error: "Invalid image." };

  const supabase = await createClient();
  const { data } = await supabase.from("product_images").select("path, product_id").eq("id", imageId).maybeSingle();
  if (!data) return { ok: false, error: "Image not found." };

  const { error } = await supabase.from("product_images").delete().eq("id", imageId);
  if (error) return { ok: false, error: "Could not delete image." };
  await supabase.storage.from(PRODUCT_BUCKET).remove([data.path as string]);

  revalidatePath(`/admin/products/${data.product_id}`);
  refreshProduct();
  return { ok: true };
}

export async function reorderProductImages(productId: string, orderedIds: string[]): Promise<ActionResult> {
  if (!(await getCatalogEditorOrNull())) return { ok: false, error: "Not authorised." };
  const parsed = z.object({ productId: uuid, ids: z.array(uuid).max(12) }).safeParse({ productId, ids: orderedIds });
  if (!parsed.success) return { ok: false, error: "Invalid request." };

  const supabase = await createClient();
  for (const [index, imageId] of parsed.data.ids.entries()) {
    await supabase
      .from("product_images")
      .update({ sort_order: index })
      .eq("id", imageId)
      .eq("product_id", parsed.data.productId);
  }
  revalidatePath(`/admin/products/${productId}`);
  refreshProduct();
  return { ok: true };
}
