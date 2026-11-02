import type { MetadataRoute } from "next";
import { createClient } from "@supabase/supabase-js";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  // Anonymous client (no cookies) so this can be cached
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
  const { data } = await supabase.from("products").select("slug, updated_at").eq("is_active", true).limit(5000);

  return [
    { url: base, changeFrequency: "daily", priority: 1 },
    { url: `${base}/products`, changeFrequency: "daily", priority: 0.9 },
    ...(data ?? []).map((p) => ({
      url: `${base}/products/${p.slug}`,
      lastModified: p.updated_at as string,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
  ];
}
