import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { hasAdminKey } from "@/lib/supabase/admin";
import { formatDate } from "@/lib/utils";
import { isDisabled, listUsers } from "../data";
import { RoleBadge } from "../role-badge";
import { UserManager } from "./user-manager";
import { OutletAccess } from "./outlet-access";
import { CompanyAccess } from "./company-access";
import { getAdminOutlets } from "@/lib/admin-outlets";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Manage user" };

export default async function AdminUserPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireAdmin();
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();

  const user = (await listUsers()).find((u) => u.id === id);
  if (!user) notFound();
  const isMe = user.id === me.id;

  const supabase = await createClient();
  const { data: prof } = await supabase
    .from("profiles")
    .select("username, company:companies(id, name)")
    .eq("id", id)
    .maybeSingle();
  const company = (prof?.company ?? null) as unknown as { id: string; name: string } | null;
  // Staff get outlets of the company they sign in with plus any extra companies an admin opened for them.
  const [{ data: companyRows }, { data: extraRows }] = await Promise.all([
    supabase.from("companies").select("id, name").order("sort_order"),
    supabase.from("user_companies").select("company_id").eq("user_id", id),
  ]);
  const companies = (companyRows ?? []) as { id: string; name: string }[];
  const extraCompanies = (extraRows ?? []).map((r) => r.company_id as string);
  const allowedCompanies = new Set([...(company ? [company.id] : []), ...extraCompanies]);
  const outlets = (await getAdminOutlets(me)).filter((o) => !company || (o.company_id && allowedCompanies.has(o.company_id)));
  const { data: assignedRows } = await supabase.from("outlet_users").select("outlet_id").eq("user_id", id);
  const assigned = (assignedRows ?? []).map((r) => r.outlet_id as string);

  return (
    <div className="max-w-3xl">
      <Link href="/admin/users" className="inline-flex items-center gap-1.5 text-sm text-zinc-600 hover:text-zinc-900">
        <ArrowLeft className="size-4" /> Users
      </Link>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold tracking-tight">{user.full_name || user.email}</h1>
        <RoleBadge role={user.role} />
        {isDisabled(user) && <span className="text-sm font-semibold text-red-600">Disabled</span>}
      </div>
      <p className="mt-1 text-sm text-zinc-500">
        {user.email} · Joined {formatDate(user.created_at)} · Last sign-in{" "}
        {user.last_sign_in_at ? formatDate(user.last_sign_in_at, true) : "never"}
      </p>

      {prof?.username && company && (
        <p className="mt-1 text-sm text-zinc-500">
          Signs in with company <strong>{company.name}</strong> and username <strong>{prof.username as string}</strong>
        </p>
      )}

      <UserManager
        user={{
          id: user.id,
          fullName: user.full_name ?? "",
          phone: user.phone ?? "",
          role: user.role,
          disabled: isDisabled(user),
        }}
        isMe={isMe}
        hasKey={hasAdminKey()}
      />

      {(user.role === "staff" || user.role === "manager") && company && (
        <CompanyAccess userId={user.id} homeCompanyId={company.id} companies={companies} assigned={extraCompanies} />
      )}

      {(user.role === "staff" || user.role === "manager") && (
        <OutletAccess userId={user.id} outlets={outlets} assigned={assigned} />
      )}
    </div>
  );
}
