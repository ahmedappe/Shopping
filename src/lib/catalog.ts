import "server-only";
import { createClient } from "@/lib/supabase/server";
import { STORE } from "@/config/store";
import { sanitizeSearch } from "@/lib/utils";
import { getCurrentOutlet } from "@/lib/outlet";
import type { Category, ProductDetail, ProductListing } from "@/lib/types";

const LISTING_COLUMNS =
  "id,name,slug,description,is_active,is_featured,created_at,category_id,category_slug,category_name,compare_at_price,min_price,max_price,total_stock,variant_count,image_path";

export async function getCategories(): Promise<Category[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("categories")
    .select("id,name,slug,description,sort_order")
    .order("sort_order")
    .order("name");
  return (data ?? []) as Category[];
}

export async function getFeaturedProducts(limit = 8): Promise<ProductListing[]> {
  const { outlet } = await getCurrentOutlet();
  if (!outlet) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("outlet_product_listing")
    .select(LISTING_COLUMNS)
    .eq("outlet_id", outlet.id)
    .eq("is_active", true)
    .eq("is_featured", true)
    .gt("variant_count", 0)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as ProductListing[];
}

export async function getNewArrivals(limit = 8): Promise<ProductListing[]> {
  const { outlet } = await getCurrentOutlet();
  if (!outlet) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("outlet_product_listing")
    .select(LISTING_COLUMNS)
    .eq("outlet_id", outlet.id)
    .eq("is_active", true)
    .gt("variant_count", 0)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as ProductListing[];
}

export type ProductSearchParams = {
  q?: string;
  category?: string;
  min?: string;
  max?: string;
  inStock?: string;
  sort?: string;
  page?: string;
};

export const SORT_OPTIONS = {
  newest: { label: "Newest", column: "created_at", ascending: false },
  "price-asc": { label: "Price: low to high", column: "min_price", ascending: true },
  "price-desc": { label: "Price: high to low", column: "min_price", ascending: false },
  name: { label: "Name A–Z", column: "name", ascending: true },
} as const;

export async function searchProducts(params: ProductSearchParams) {
  const { outlet } = await getCurrentOutlet();
  const supabase = await createClient();
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const from = (page - 1) * STORE.pageSize;
  const to = from + STORE.pageSize - 1;

  if (!outlet) return { products: [] as ProductListing[], total: 0, page, pageCount: 1 };

  let query = supabase
    .from("outlet_product_listing")
    .select(LISTING_COLUMNS, { count: "exact" })
    .eq("outlet_id", outlet.id)
    .eq("is_active", true)
    .gt("variant_count", 0);

  const q = sanitizeSearch(params.q ?? "");
  if (q) {
    const pattern = `*${q.replace(/ /g, "*")}*`;
    query = query.or(`name.ilike.${pattern},description.ilike.${pattern},category_name.ilike.${pattern}`);
  }
  if (params.category && /^[a-z0-9-]{1,80}$/.test(params.category)) {
    query = query.eq("category_slug", params.category);
  }
  const min = Number(params.min);
  const max = Number(params.max);
  if (params.min && Number.isFinite(min) && min >= 0) query = query.gte("min_price", min);
  if (params.max && Number.isFinite(max) && max > 0) query = query.lte("min_price", max);
  if (params.inStock === "1") query = query.gt("total_stock", 0);

  const sort = SORT_OPTIONS[(params.sort ?? "newest") as keyof typeof SORT_OPTIONS] ?? SORT_OPTIONS.newest;
  query = query.order(sort.column, { ascending: sort.ascending }).order("id").range(from, to);

  const { data, count, error } = await query;
  if (error) console.error("searchProducts", error.message);

  return {
    products: (data ?? []) as ProductListing[],
    total: count ?? 0,
    page,
    pageCount: Math.max(1, Math.ceil((count ?? 0) / STORE.pageSize)),
  };
}

export async function getProductBySlug(slug: string): Promise<ProductDetail | null> {
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return null;
  const { outlet } = await getCurrentOutlet();
  if (!outlet) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("products")
    .select(
      "*, category:categories(id,name,slug), product_variants(*), product_images(id,product_id,path,width,height,sort_order)",
    )
    .eq("slug", slug)
    .eq("is_active", true)
    .eq("product_variants.is_active", true)
    .order("sort_order", { referencedTable: "product_variants" })
    .order("sort_order", { referencedTable: "product_images" })
    .maybeSingle();
  const product = data as ProductDetail | null;
  if (!product) return null;

  // Price and stock are per outlet. Only variants this outlet sells are shown.
  const { data: rows } = await supabase
    .from("outlet_variants")
    .select("variant_id, price, stock")
    .eq("outlet_id", outlet.id)
    .eq("is_active", true)
    .in("variant_id", product.product_variants.map((v) => v.id));
  const here = new Map(((rows ?? []) as { variant_id: string; price: number | string; stock: number }[]).map((r) => [r.variant_id, r]));
  const variants = product.product_variants
    .filter((v) => here.has(v.id))
    .map((v) => ({ ...v, price: Number(here.get(v.id)!.price), stock: here.get(v.id)!.stock }));
  if (variants.length === 0) return null; // not sold at this outlet

  return { ...product, product_variants: variants };
}

export async function getRelatedProducts(categoryId: string | null, excludeId: string, limit = 4) {
  if (!categoryId) return [];
  const { outlet } = await getCurrentOutlet();
  if (!outlet) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("outlet_product_listing")
    .select(LISTING_COLUMNS)
    .eq("outlet_id", outlet.id)
    .eq("is_active", true)
    .eq("category_id", categoryId)
    .neq("id", excludeId)
    .gt("variant_count", 0)
    .limit(limit);
  return (data ?? []) as ProductListing[];
}
