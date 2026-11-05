import "server-only";
import { createClient } from "@/lib/supabase/server";
import { OUTLET_COLUMNS, toOutlet } from "@/lib/outlet";
import type { SessionUser } from "@/lib/auth";
import type { Outlet } from "@/lib/types";

/** Outlets this admin-area user may work in (every outlet for admin), including inactive ones. */
export async function getAdminOutlets(user: SessionUser): Promise<Outlet[]> {
  if (user.outletIds.length === 0) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("outlets")
    .select(OUTLET_COLUMNS)
    .in("id", user.outletIds)
    .order("sort_order")
    .order("name");
  return (data ?? []).map((o) => toOutlet(o as Record<string, unknown>));
}

/**
 * Resolves the ?outlet=<slug> filter against the outlets the user may access.
 * `selected` is null when showing "all my outlets".
 */
export function pickOutlet(outlets: Outlet[], slug?: string) {
  const selected = slug ? (outlets.find((o) => o.slug === slug) ?? null) : null;
  return { selected, ids: selected ? [selected.id] : outlets.map((o) => o.id) };
}

/** Companies this admin-area user may work in (every company for admin; otherwise the companies of their outlets). */
export async function getAdminCompanies(user: SessionUser): Promise<{ id: string; name: string }[]> {
  const supabase = await createClient();
  let query = supabase.from("companies").select("id, name").order("sort_order").order("name");
  if (!user.isAdmin) {
    const outlets = await getAdminOutlets(user);
    const ids = [...new Set(outlets.map((o) => o.company_id).filter(Boolean))] as string[];
    if (ids.length === 0) return [];
    query = query.in("id", ids);
  }
  const { data } = await query;
  return (data ?? []) as { id: string; name: string }[];
}
