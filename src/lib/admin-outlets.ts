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
