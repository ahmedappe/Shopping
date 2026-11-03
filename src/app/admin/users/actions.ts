"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAdminOrNull } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createUserSchema, firstError, resetPasswordSchema, updateUserSchema } from "@/lib/validation";
import { friendlyDbError } from "@/lib/utils";
import type { ActionResult } from "@/lib/types";

const NO_KEY =
  "The server key for managing logins isn't set up yet. Add SUPABASE_SERVICE_ROLE_KEY in Vercel → Settings → Environment Variables, then redeploy.";

function refresh(userId?: string) {
  revalidatePath("/admin/users");
  if (userId) revalidatePath(`/admin/users/${userId}`);
}

export type CreateUserResult = { ok: true; userId: string } | { ok: false; error: string };

export async function createUser(input: unknown): Promise<CreateUserResult> {
  if (!(await getAdminOrNull())) return { ok: false, error: "Only admins can create users." };
  const parsed = createUserSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const d = parsed.data;

  const admin = createAdminClient();
  if (!admin) return { ok: false, error: NO_KEY };

  const { data, error } = await admin.auth.admin.createUser({
    email: d.email,
    password: d.password,
    email_confirm: true, // admin-created accounts can sign in straight away
    user_metadata: { full_name: d.fullName, phone: d.phone },
  });
  if (error || !data.user) {
    const msg = error?.message ?? "";
    return {
      ok: false,
      error: /already|registered|exists/i.test(msg) ? "A user with this email already exists." : "Could not create the user.",
    };
  }

  if (d.role !== "customer") {
    // Uses the admin's own session; the database re-checks that they're an admin.
    const supabase = await createClient();
    const { error: roleError } = await supabase.rpc("admin_set_user_role", {
      p_user_id: data.user.id,
      p_role: d.role,
    });
    if (roleError) {
      refresh();
      return { ok: false, error: `User created, but the role couldn't be set: ${friendlyDbError(roleError.message)}` };
    }
  }

  refresh();
  return { ok: true, userId: data.user.id };
}

export async function updateUser(input: unknown): Promise<ActionResult> {
  const me = await getAdminOrNull();
  if (!me) return { ok: false, error: "Only admins can manage users." };
  const parsed = updateUserSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const d = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_update_profile", {
    p_user_id: d.userId,
    p_full_name: d.fullName,
    p_phone: d.phone,
  });
  if (error) return { ok: false, error: friendlyDbError(error.message) };

  if (d.userId !== me.id) {
    const { error: roleError } = await supabase.rpc("admin_set_user_role", { p_user_id: d.userId, p_role: d.role });
    if (roleError) return { ok: false, error: friendlyDbError(roleError.message) };
  }

  refresh(d.userId);
  return { ok: true, message: "Saved." };
}

export async function resetUserPassword(input: unknown): Promise<ActionResult> {
  if (!(await getAdminOrNull())) return { ok: false, error: "Only admins can manage users." };
  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };

  const admin = createAdminClient();
  if (!admin) return { ok: false, error: NO_KEY };

  const { error } = await admin.auth.admin.updateUserById(parsed.data.userId, { password: parsed.data.password });
  if (error) return { ok: false, error: "Could not change the password." };
  return { ok: true, message: "Password changed. Share the new password with the user securely." };
}

export async function setUserDisabled(userId: string, disabled: boolean): Promise<ActionResult> {
  const me = await getAdminOrNull();
  if (!me) return { ok: false, error: "Only admins can manage users." };
  if (!z.string().uuid().safeParse(userId).success) return { ok: false, error: "Invalid user." };
  if (userId === me.id) return { ok: false, error: "You can't disable your own account." };

  const supabase = await createClient();
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
  if (disabled && profile?.role === "admin") {
    return { ok: false, error: "Change this user's role from Admin first, then disable them." };
  }

  const admin = createAdminClient();
  if (!admin) return { ok: false, error: NO_KEY };

  // ~100 years = effectively permanent; "none" lifts the ban
  const { error } = await admin.auth.admin.updateUserById(userId, { ban_duration: disabled ? "876000h" : "none" });
  if (error) return { ok: false, error: "Could not update the account." };

  refresh(userId);
  return { ok: true, message: disabled ? "Account disabled. They can no longer sign in." : "Account enabled." };
}

export async function setUserOutlets(userId: string, outletIds: string[]): Promise<ActionResult> {
  if (!(await getAdminOrNull())) return { ok: false, error: "Only admins can assign outlets." };
  const parsed = z.object({ userId: z.string().uuid(), ids: z.array(z.string().uuid()).max(50) }).safeParse({ userId, ids: outletIds });
  if (!parsed.success) return { ok: false, error: "Invalid request." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_user_outlets", {
    p_user_id: parsed.data.userId,
    p_outlet_ids: parsed.data.ids,
  });
  if (error) return { ok: false, error: friendlyDbError(error.message) };
  refresh(parsed.data.userId);
  return { ok: true, message: "Outlet access saved." };
}
