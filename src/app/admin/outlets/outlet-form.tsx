"use client";

import { useActionState, useEffect, useRef } from "react";
import { SubmitButton } from "@/components/submit-button";
import type { ActionResult, Company, Outlet } from "@/lib/types";
import { saveOutlet } from "./actions";

export function OutletForm({ outlet, companies }: { outlet?: Outlet; companies: Company[] }) {
  const [state, action] = useActionState<ActionResult | null, FormData>(saveOutlet, null);
  const formRef = useRef<HTMLFormElement>(null);
  const k = outlet?.id ?? "new";

  useEffect(() => {
    if (state?.ok && !outlet) formRef.current?.reset();
  }, [state, outlet]);

  return (
    <form ref={formRef} action={action} className="mt-4 grid gap-3 sm:grid-cols-2">
      {outlet && <input type="hidden" name="id" value={outlet.id} />}
      <div>
        <label className="label" htmlFor={`name-${k}`}>Outlet name</label>
        <input id={`name-${k}`} name="name" required maxLength={80} defaultValue={outlet?.name} className="input" />
      </div>
      <div>
        <label className="label" htmlFor={`co-${k}`}>Company</label>
        <select id={`co-${k}`} name="companyId" required className="input" defaultValue={outlet?.company_id ?? ""}>
          <option value="" disabled>Choose company</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor={`slug-${k}`}>Short name (slug)</label>
        <input id={`slug-${k}`} name="slug" maxLength={60} defaultValue={outlet?.slug} placeholder="north-jugo" className="input" />
      </div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor={`hosts-${k}`}>Store domains (one per line)</label>
        <textarea
          id={`hosts-${k}`}
          name="hostnames"
          rows={2}
          defaultValue={outlet?.hostnames.join("\n")}
          placeholder="shop.northjugo.mv"
          className="input"
        />
        <p className="mt-1 text-xs text-zinc-500">Customers who open these domains see this outlet&apos;s prices and stock. Also add each domain in Vercel.</p>
      </div>
      <div>
        <label className="label" htmlFor={`bank-${k}`}>Bank</label>
        <input id={`bank-${k}`} name="bankName" maxLength={80} defaultValue={outlet?.bank_name ?? ""} placeholder="Bank of Maldives" className="input" />
      </div>
      <div>
        <label className="label" htmlFor={`accname-${k}`}>Account name</label>
        <input id={`accname-${k}`} name="accountName" maxLength={120} defaultValue={outlet?.account_name ?? ""} className="input" />
      </div>
      <div>
        <label className="label" htmlFor={`accno-${k}`}>Account number</label>
        <input id={`accno-${k}`} name="accountNumber" maxLength={40} defaultValue={outlet?.account_number ?? ""} className="input" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor={`fee-${k}`}>Delivery fee</label>
          <input id={`fee-${k}`} name="deliveryFee" type="number" step="0.01" min={0} defaultValue={outlet?.delivery_fee ?? ""} placeholder="Store default" className="input" />
        </div>
        <div>
          <label className="label" htmlFor={`free-${k}`}>Free delivery over</label>
          <input id={`free-${k}`} name="freeDeliveryThreshold" type="number" step="0.01" min={0} defaultValue={outlet?.free_delivery_threshold ?? ""} placeholder="Store default" className="input" />
        </div>
      </div>
      <div>
        <label className="label" htmlFor={`sort-${k}`}>Sort order</label>
        <input id={`sort-${k}`} name="sortOrder" type="number" min={0} defaultValue={outlet?.sort_order ?? 0} className="input" />
      </div>
      <label className="flex items-center gap-2 self-end pb-2 text-sm">
        <input type="checkbox" name="isActive" defaultChecked={outlet?.is_active ?? true} /> Open for customers
      </label>
      <div className="flex items-center gap-3 sm:col-span-2">
        <SubmitButton pendingText="Saving…">{outlet ? "Save outlet" : "Add outlet"}</SubmitButton>
        {state && <p className={`text-sm ${state.ok ? "text-green-700" : "text-red-600"}`}>{state.ok ? state.message : state.error}</p>}
      </div>
    </form>
  );
}
