import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { STORE } from "@/config/store";
import { AdminNav } from "./admin-nav";

export const metadata: Metadata = { title: { default: "Admin", template: `%s · Admin · ${STORE.name}` }, robots: { index: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdmin();

  return (
    <div className="min-h-dvh bg-zinc-50 lg:flex">
      <aside className="border-b border-zinc-200 bg-white lg:sticky lg:top-0 lg:h-dvh lg:w-60 lg:shrink-0 lg:border-r lg:border-b-0">
        <div className="flex h-14 items-center justify-between px-4 lg:h-16 lg:px-5">
          <Link href="/admin" className="font-bold tracking-tight">
            {STORE.name} <span className="font-normal text-zinc-500">Admin</span>
          </Link>
        </div>
        <AdminNav />
        <div className="hidden px-5 py-4 text-xs text-zinc-500 lg:absolute lg:bottom-0 lg:block">
          Signed in as
          <br />
          <span className="font-medium text-zinc-700">{user.email}</span>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
    </div>
  );
}
