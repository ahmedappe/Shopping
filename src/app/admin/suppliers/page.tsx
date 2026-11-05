import type { Metadata } from "next";
import { requireManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getAdminCompanies } from "@/lib/admin-outlets";
import { SupplierForm } from "./supplier-form";
import { SupplierRow } from "./supplier-row";

export const metadata: Metadata = { title: "Suppliers" };

type Row = {
  id: string;
  company_id: string;
  name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  gst_number: string | null;
  notes: string | null;
  is_active: boolean;
};

export default async function SuppliersPage() {
  const user = await requireManager();
  const companies = await getAdminCompanies(user);
  const supabase = await createClient();
  const { data } = companies.length
    ? await supabase
        .from("suppliers")
        .select("id, company_id, name, contact_name, phone, email, gst_number, notes, is_active")
        .in("company_id", companies.map((c) => c.id))
        .order("name")
    : { data: [] };
  const rows = (data ?? []) as Row[];
  const companyName = new Map(companies.map((c) => [c.id, c.name]));

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold tracking-tight">Suppliers</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Suppliers are kept per company. Set each product&apos;s main supplier on the product page; the reorder list groups items by it.
      </p>

      <section className="card mt-6 p-5">
        <h2 className="mb-4 font-semibold">Add a supplier</h2>
        <SupplierForm
          companies={companies}
          supplier={{ id: null, companyId: companies.length === 1 ? companies[0].id : "", name: "", contactName: "", phone: "", email: "", gstNumber: "", notes: "", isActive: true }}
        />
      </section>

      <section className="card mt-6">
        <ul className="divide-y divide-zinc-100">
          {rows.map((s) => (
            <SupplierRow
              key={s.id}
              companyName={companyName.get(s.company_id) ?? ""}
              companies={companies}
              supplier={{
                id: s.id,
                companyId: s.company_id,
                name: s.name,
                contactName: s.contact_name ?? "",
                phone: s.phone ?? "",
                email: s.email ?? "",
                gstNumber: s.gst_number ?? "",
                notes: s.notes ?? "",
                isActive: s.is_active,
              }}
            />
          ))}
          {rows.length === 0 && <li className="p-8 text-center text-sm text-zinc-500">No suppliers yet.</li>}
        </ul>
      </section>
    </div>
  );
}
