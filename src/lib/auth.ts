import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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

  return {
    id: user.id,
    email: user.email ?? null,
    fullName: (profile?.full_name as string | null) ?? null,
    phone: (profile?.phone as string | null) ?? null,
    isAdmin: profile?.role === "admin",
  };
});

export type SessionUser = NonNullable<Awaited<ReturnType<typeof getSessionUser>>>;

export async function requireUser(nextPath = "/") {
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  return user;
}

/** Use in admin pages and EVERY admin server action. RLS enforces it again in the DB. */
export async function requireAdmin() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/admin");
  if (!user.isAdmin) notFound();
  return user;
}

/** For server actions: returns null instead of redirecting. */
export async function getAdminOrNull() {
  const user = await getSessionUser();
  return user?.isAdmin ? user : null;
}
