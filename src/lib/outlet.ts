import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import type { Outlet } from "@/lib/types";

/** Remembers the outlet chosen with the switcher on a domain that isn't tied to one outlet. */
export const OUTLET_COOKIE = "outlet";

export const OUTLET_COLUMNS =
  "id,name,slug,hostnames,bank_name,account_name,account_number,delivery_fee,free_delivery_threshold,is_active,sort_order,company_id";

export function normaliseHost(raw: string | null | undefined) {
  return (raw ?? "")
    .split(",")[0]
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, "")
    .replace(/^www\./, "");
}

export function toOutlet(row: Record<string, unknown>): Outlet {
  return {
    id: row.id as string,
    name: row.name as string,
    slug: row.slug as string,
    hostnames: (row.hostnames as string[] | null) ?? [],
    bank_name: (row.bank_name as string | null) ?? null,
    account_name: (row.account_name as string | null) ?? null,
    account_number: (row.account_number as string | null) ?? null,
    delivery_fee: row.delivery_fee != null ? Number(row.delivery_fee) : null,
    free_delivery_threshold: row.free_delivery_threshold != null ? Number(row.free_delivery_threshold) : null,
    is_active: row.is_active as boolean,
    sort_order: (row.sort_order as number) ?? 0,
    company_id: (row.company_id as string | null) ?? null,
  };
}

/** Active outlets, in display order. */
export const getOutlets = cache(async (): Promise<Outlet[]> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("outlets")
    .select(OUTLET_COLUMNS)
    .eq("is_active", true)
    .order("sort_order")
    .order("name");
  return (data ?? []).map((r) => toOutlet(r as Record<string, unknown>));
});

/**
 * Which outlet is this visitor shopping at?
 *  1. the domain they came in on (each outlet has its own),
 *  2. otherwise the outlet picked with the switcher (cookie),
 *  3. otherwise the first outlet.
 * `byDomain` is true when the domain decided it (the switcher is then hidden).
 */
export const getCurrentOutlet = cache(async () => {
  const [outlets, h, c] = await Promise.all([getOutlets(), headers(), cookies()]);
  const host = normaliseHost(h.get("x-forwarded-host") ?? h.get("host"));

  const byHost = host ? outlets.find((o) => o.hostnames.some((x) => normaliseHost(x) === host)) : undefined;
  if (byHost) return { outlet: byHost, outlets, byDomain: true as boolean };

  const slug = c.get(OUTLET_COOKIE)?.value;
  const byCookie = outlets.find((o) => o.slug === slug);
  return { outlet: byCookie ?? outlets[0] ?? null, outlets, byDomain: false as boolean };
});

/** Outlets the signed-in staff member may work in. Admins get all (including inactive). */
export async function getOutletsByIds(ids: string[]): Promise<Outlet[]> {
  if (ids.length === 0) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("outlets")
    .select(OUTLET_COLUMNS)
    .in("id", ids)
    .order("sort_order")
    .order("name");
  return (data ?? []).map((r) => toOutlet(r as Record<string, unknown>));
}

/** https://the-domain-being-visited, so links, sitemaps and emails use the outlet's own domain. */
export async function getSiteOrigin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const bare = host.split(",")[0].trim();
  const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(bare);
  const proto = local ? "http" : (h.get("x-forwarded-proto") ?? "https").split(",")[0].trim();
  return `${proto}://${bare}`;
}
