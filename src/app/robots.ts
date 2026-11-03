import type { MetadataRoute } from "next";
import { getSiteOrigin } from "@/lib/outlet";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const base = await getSiteOrigin();
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/checkout", "/orders", "/cart", "/auth"] }],
    sitemap: `${base}/sitemap.xml`,
  };
}
