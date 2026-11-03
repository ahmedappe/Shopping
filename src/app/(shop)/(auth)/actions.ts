"use server";

import { getSiteOrigin } from "@/lib/outlet";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { signInSchema, signUpSchema, firstError } from "@/lib/validation";
import { safeRedirectPath } from "@/lib/utils";

export type AuthState = { error?: string; message?: string; values?: Record<string, string> } | null;

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const values = { email: String(formData.get("email") ?? "") };
  const parsed = signInSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { error: firstError(parsed.error), values };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    // Generic message — don't reveal whether the email exists
    return {
      error: error.message.includes("Email not confirmed")
        ? "Please confirm your email first — check your inbox."
        : "Incorrect email or password.",
      values,
    };
  }

  revalidatePath("/", "layout");
  redirect(safeRedirectPath(String(formData.get("next") ?? ""), "/"));
}

export async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const raw = {
    fullName: String(formData.get("fullName") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
  };
  const values = { fullName: raw.fullName, phone: raw.phone, email: raw.email };
  const parsed = signUpSchema.safeParse(raw);
  if (!parsed.success) return { error: firstError(parsed.error), values };

  const origin = await getSiteOrigin();
  const next = safeRedirectPath(String(formData.get("next") ?? ""), "/");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.fullName, phone: parsed.data.phone },
      emailRedirectTo: `${origin}/auth/confirm?next=${encodeURIComponent(next)}`,
    },
  });

  if (error) {
    return { error: error.message.includes("already") ? "An account with this email already exists." : error.message, values };
  }

  // If email confirmation is disabled in Supabase, the user is signed in immediately.
  if (data.session) {
    revalidatePath("/", "layout");
    redirect(next);
  }
  return { message: "Check your email to confirm your account, then sign in." };
}
