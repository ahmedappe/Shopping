"use client";

import { useState } from "react";
import { SupplierForm, type SupplierInput } from "./supplier-form";

export function SupplierRow({ supplier, companyName, companies }: { supplier: SupplierInput; companyName: string; companies: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium">
            {supplier.name} {!supplier.isActive && <span className="text-xs font-normal text-zinc-500">(inactive)</span>}
          </p>
          <p className="text-xs text-zinc-500">
            {companyName}
            {supplier.contactName && ` · ${supplier.contactName}`}
            {supplier.phone && ` · ${supplier.phone}`}
            {supplier.gstNumber && ` · GST ${supplier.gstNumber}`}
          </p>
        </div>
        <button type="button" className="btn-outline" onClick={() => setOpen((o) => !o)}>{open ? "Close" : "Edit"}</button>
      </div>
      {open && (
        <div className="mt-4">
          <SupplierForm companies={companies} supplier={supplier} onDone={() => setOpen(false)} />
        </div>
      )}
    </li>
  );
}
