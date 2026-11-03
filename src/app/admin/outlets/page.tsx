import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { getAdminOutlets } from "@/lib/admin-outlets";
import { createClient } from "@/lib/supabase/server";
import type { Company } from "@/lib/types";
import { OutletForm } from "./outlet-form";

export const metadata: Metadata = { title: "Outlets" };

export default async function AdminOutletsPage() {
  const user = await requireAdmin();
  const outlets = await getAdminOutlets(user);
  const supabase = await createClient();
  const { data: companyRows } = await supabase.from("companies").select("id, name, slug").order("sort_order");
  const companies = (companyRows ?? []) as Company[];
  const companyName = new Map(companies.map((c) => [c.id, c.name]));

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold tracking-tight">Outlets</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Each outlet has its own domain, prices, stock and bank account. If an outlet has no account number, the store-wide bank details are used.
      </p>

      <section className="card mt-6 p-5">
        <h2 className="font-semibold">Add outlet</h2>
        <OutletForm companies={companies} />
      </section>

      <section className="card mt-6 divide-y divide-zinc-100">
        {outlets.map((o) => (
          <details key={o.id} className="group p-5">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
              <div>
                <p className="font-medium">
                  {o.name} {!o.is_active && <span className="ml-1 text-xs text-zinc-500">(closed)</span>}
                </p>
                <p className="text-xs text-zinc-500">
                  {o.company_id ? companyName.get(o.company_id) : "No company"} ·{" "}
                  {o.hostnames.length ? o.hostnames.join(", ") : "No domain yet"} ·{" "}
                  {o.account_number ? `${o.bank_name ?? "Bank"} ${o.account_number}` : "Using store bank details"}
                </p>
              </div>
              <span className="text-sm text-brand-700 group-open:hidden">Edit</span>
            </summary>
            <OutletForm outlet={o} companies={companies} />
          </details>
        ))}
        {outlets.length === 0 && <p className="p-5 text-sm text-zinc-500">No outlets yet.</p>}
      </section>
    </div>
  );
}
