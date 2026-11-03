import type { MetadataRoute } from "next";
import { createClient } from "@supabase/supabase-js";
import { getCurrentOutlet, getSiteOrigin } from "@/lib/outlet";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [base, { outlet }] = await Promise.all([getSiteOrigin(), getCurrentOutlet()]);
  const pages: MetadataRoute.Sitemap = [
    { url: base, changeFrequency: "daily", priority: 1 },
    { url: `${base}/products`, changeFrequency: "daily", priority: 0.9 },
  ];
  if (!outlet) return pages;

  // Anonymous client (no cookies). Lists only items this outlet sells.
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
  const { data } = await supabase
    .from("outlet_product_listing")
    .select("slug, created_at")
    .eq("outlet_id", outlet.id)
    .eq("is_active", true)
    .limit(5000);

  return [
    ...pages,
    ...(data ?? []).map((p) => ({
      url: `${base}/products/${p.slug}`,
      lastModified: p.created_at as string,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
  ];
}
