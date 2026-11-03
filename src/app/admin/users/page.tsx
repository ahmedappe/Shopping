import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { requireAdmin, type Role } from "@/lib/auth";
import { hasAdminKey } from "@/lib/supabase/admin";
import { cn, formatDate } from "@/lib/utils";
import { isDisabled, listUsers } from "./data";
import { RoleBadge } from "./role-badge";
import { CreateUserForm } from "./create-user-form";

export const metadata: Metadata = { title: "Users" };

const TABS: { value?: Role; label: string }[] = [
  { label: "All" },
  { value: "admin", label: "Admins" },
  { value: "manager", label: "Managers" },
  { value: "staff", label: "Staff" },
  { value: "customer", label: "Customers" },
];

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string; q?: string }>;
}) {
  const me = await requireAdmin();
  const params = await searchParams;
  const role = TABS.find((t) => t.value === params.role)?.value;
  const q = (params.q ?? "").trim().slice(0, 80);
  const users = await listUsers(q, role);

  const href = (r?: string) => {
    const sp = new URLSearchParams();
    if (r) sp.set("role", r);
    if (q) sp.set("q", q);
    return `/admin/users${sp.size ? `?${sp}` : ""}`;
  };

  return (
    <div className="max-w-5xl">
      <h1 className="text-2xl font-bold tracking-tight">Users</h1>
      <p className="text-sm text-zinc-500">Create staff accounts and control what each person can access.</p>

      {!hasAdminKey() && (
        <div className="mt-6 flex gap-3 rounded-xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">
          <AlertTriangle className="size-5 shrink-0" />
          <p>
            To create users, reset passwords or disable accounts, add <code className="font-semibold">SUPABASE_SERVICE_ROLE_KEY</code>{" "}
            in Vercel → Settings → Environment Variables, then redeploy. You can still change roles without it.
          </p>
        </div>
      )}

      <section className="card mt-6 p-5">
        <h2 className="font-semibold">Add user</h2>
        <CreateUserForm />
      </section>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 overflow-x-auto">
          {TABS.map((t) => (
            <Link
              key={t.label}
              href={href(t.value)}
              className={cn(
                "shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium",
                role === t.value ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-200",
              )}
            >
              {t.label}
            </Link>
          ))}
        </div>
        <form className="w-full sm:w-72">
          {role && <input type="hidden" name="role" value={role} />}
          <input name="q" type="search" defaultValue={q} placeholder="Name, email or phone" className="input" />
        </form>
      </div>

      <div className="card mt-4 overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs font-medium text-zinc-500 uppercase">
            <tr>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Last sign-in</th>
              <th className="px-4 py-3">Status</th>
              <th />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-zinc-50">
                <td className="px-4 py-3">
                  <Link href={`/admin/users/${u.id}`} className="font-medium hover:underline">
                    {u.full_name || "—"}
                    {u.id === me.id && <span className="ml-1.5 text-xs font-normal text-zinc-500">(you)</span>}
                  </Link>
                  <p className="text-xs text-zinc-500">
                    {u.email}
                    {u.phone && ` · ${u.phone}`}
                  </p>
                </td>
                <td className="px-4 py-3">
                  <RoleBadge role={u.role} />
                </td>
                <td className="px-4 py-3 text-zinc-500">{u.last_sign_in_at ? formatDate(u.last_sign_in_at, true) : "Never"}</td>
                <td className="px-4 py-3">
                  {isDisabled(u) ? (
                    <span className="text-xs font-semibold text-red-600">Disabled</span>
                  ) : (
                    <span className="text-xs text-green-700">Active</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/admin/users/${u.id}`} className="inline-flex text-zinc-400 hover:text-zinc-900" aria-label="Manage">
                    <ChevronRight className="size-4" />
                  </Link>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-zinc-500">
                  No users found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
