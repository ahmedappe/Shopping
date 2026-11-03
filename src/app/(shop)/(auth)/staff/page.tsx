import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { safeRedirectPath } from "@/lib/utils";
import type { Company } from "@/lib/types";
import { StaffLoginForm } from "./staff-form";

// Not linked anywhere on the customer site; staff are given this address directly.
export const metadata: Metadata = { title: "Staff sign in", robots: { index: false, follow: false } };

export default async function StaffLoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const nextPath = safeRedirectPath(next, "/admin");
  const user = await getSessionUser();
  if (user?.canEditCatalog) redirect(nextPath.startsWith("/admin") ? nextPath : "/admin");

  const supabase = await createClient();
  const { data } = await supabase.from("companies").select("id, name, slug").order("sort_order");

  return (
    <div className="container-page flex justify-center py-16">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold tracking-tight">Staff sign in</h1>
        <p className="mt-1 text-sm text-zinc-500">Choose your company and sign in with your username.</p>
        <div className="mt-8">
          <StaffLoginForm next={nextPath} companies={(data ?? []) as Company[]} />
        </div>
      </div>
    </div>
  );
}
