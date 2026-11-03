import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Role } from "@/lib/auth";

export type AdminUserRow = {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  role: Role;
  created_at: string;
  last_sign_in_at: string | null;
  banned_until: string | null;
};

export const isDisabled = (u: Pick<AdminUserRow, "banned_until">) =>
  Boolean(u.banned_until && new Date(u.banned_until) > new Date());

export async function listUsers(search?: string, role?: Role) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_list_users", {
    p_search: search || null,
    p_role: role || null,
  });
  if (error) console.error("admin_list_users", error.message);
  return (data ?? []) as AdminUserRow[];
}
