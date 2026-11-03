import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Role = "customer" | "staff" | "manager" | "admin";

export const ROLE_LABELS: Record<Role, string> = {
  customer: "Customer",
  staff: "Staff",
  manager: "Manager",
  admin: "Admin",
};

const ROLES: Role[] = ["customer", "staff", "manager", "admin"];

export const getSessionUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, phone, role")
    .eq("id", user.id)
    .single();

  const role: Role = ROLES.includes(profile?.role as Role) ? (profile!.role as Role) : "customer";

  // Outlets this person may work in. Admin: every outlet. Others: assigned ones.
  let outletIds: string[] = [];
  const isStaffish = role !== "customer";
  if (isStaffish) {
    if (role === "admin") {
      const { data } = await supabase.from("outlets").select("id");
      outletIds = (data ?? []).map((o) => o.id as string);
    } else {
      const { data } = await supabase.from("outlet_users").select("outlet_id").eq("user_id", user.id);
      outletIds = (data ?? []).map((o) => o.outlet_id as string);
    }
  }

  return {
    id: user.id,
    /** Outlet ids this user can work in (all of them for admin). */
    outletIds,
    email: user.email ?? null,
    fullName: (profile?.full_name as string | null) ?? null,
    phone: (profile?.phone as string | null) ?? null,
    role,
    /** Admin only: create and manage users. */
    isAdmin: role === "admin",
    /** Manager or admin: orders, payment slips, dashboard, deleting products. */
    canManageStore: role === "manager" || role === "admin",
    /** Staff, manager or admin: view, add and edit products and categories. */
    canEditCatalog: role === "staff" || role === "manager" || role === "admin",
  };
});

export type SessionUser = NonNullable<Awaited<ReturnType<typeof getSessionUser>>>;

export async function requireUser(nextPath = "/") {
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  return user;
}

/*
 * Page guards. Use one in every admin page. The database enforces the same
 * rules again through Row Level Security, so these are a second layer.
 */
async function requireLevel(check: (u: SessionUser) => boolean, nextPath: string) {
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  if (!check(user)) {
    // Staff who open a page above their level go to products instead of a 404
    if (user.canEditCatalog) redirect("/admin/products");
    notFound();
  }
  return user;
}

export const requireCatalogEditor = () => requireLevel((u) => u.canEditCatalog, "/admin");
export const requireManager = () => requireLevel((u) => u.canManageStore, "/admin");
export const requireAdmin = () => requireLevel((u) => u.isAdmin, "/admin/users");

/* Server-action guards: return null instead of redirecting. */
export async function getCatalogEditorOrNull() {
  const user = await getSessionUser();
  return user?.canEditCatalog ? user : null;
}
export async function getManagerOrNull() {
  const user = await getSessionUser();
  return user?.canManageStore ? user : null;
}
export async function getAdminOrNull() {
  const user = await getSessionUser();
  return user?.isAdmin ? user : null;
}
