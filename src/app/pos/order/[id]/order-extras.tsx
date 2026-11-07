"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bike, UserRound, X } from "lucide-react";
import { assignDelivery, attachCustomer, detachCustomer, findCustomers, saveBusiness, type CustomerHit } from "../../actions";

export type OrderCustomer = { id: string; name: string; phone: string; points: number; referralCode: string; creditLimit: number; creditBalance: number; businessName: string; tin: string };
export type DeliveryInfo = { by: string | null; status: "assigned" | "out" | "delivered" | null; address: string };
export type StaffOption = { id: string; name: string };

type Props = {
  orderId: string;
  outletId: string;
  open: boolean;
  customer: OrderCustomer | null;
  loyaltyOn: boolean;
  isDelivery: boolean;
  delivery: DeliveryInfo;
  staff: StaffOption[];
};

const STATUS_LABEL = { assigned: "Assigned", out: "Out for delivery", delivered: "Delivered" } as const;

export function OrderExtras({ orderId, outletId, open, customer, loyaltyOn, isDelivery, delivery, staff }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<CustomerHit[]>([]);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [ref, setRef] = useState("");
  const [isBiz, setIsBiz] = useState(false);
  const [bizName, setBizName] = useState("");
  const [tin, setTin] = useState("");
  const [editBiz, setEditBiz] = useState(false);
  const [eName, setEName] = useState(customer?.businessName ?? "");
  const [eTin, setETin] = useState(customer?.tin ?? "");
  const [driver, setDriver] = useState(delivery.by ?? "");
  const [address, setAddress] = useState(delivery.address);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) {
    setErr(null);
    start(async () => {
      const res = await fn();
      if (!res.ok) return setErr(res.error ?? "Something went wrong.");
      after?.();
      router.refresh();
    });
  }

  async function search(v: string) {
    setQuery(v);
    setHits(v.trim().length >= 2 ? await findCustomers(outletId, v) : []);
  }

  const driverName = staff.find((s) => s.id === delivery.by)?.name;

  return (
    <div className="mt-3 grid gap-3 md:grid-cols-2">
      <section className="card p-3">
        <p className="flex items-center gap-1.5 text-sm font-semibold"><UserRound className="size-4" /> Customer</p>
        {customer ? (
          <div className="mt-1 flex items-start justify-between gap-2 text-sm">
            <div>
              <p className="font-medium">{customer.name} · {customer.phone}</p>
              {loyaltyOn && <p className="text-zinc-600">{customer.points} points · referral code {customer.referralCode}</p>}
              {customer.tin ? <p className="text-zinc-600">Business: {customer.businessName} · TIN {customer.tin}</p> : null}
              {open && !editBiz && <button type="button" className="text-xs underline" onClick={() => { setEName(customer.businessName); setETin(customer.tin); setEditBiz(true); }}>{customer.tin ? "Edit business" : "This is a business"}</button>}
              {editBiz && (
                <div className="mt-1 space-y-1">
                  <input className="input" placeholder="Business name" value={eName} maxLength={120} onChange={(e) => setEName(e.target.value)} />
                  <input className="input" placeholder="Business TIN (GST number)" value={eTin} maxLength={40} onChange={(e) => setETin(e.target.value)} />
                  <div className="flex gap-2">
                    <button type="button" className="btn-primary" disabled={pending} onClick={() => run(() => saveBusiness(customer.id, orderId, eName, eTin), () => setEditBiz(false))}>Save</button>
                    <button type="button" className="btn-outline" onClick={() => setEditBiz(false)}>Cancel</button>
                  </div>
                  <p className="text-xs text-zinc-500">Leave both blank to make this a normal customer.</p>
                </div>
              )}
              {(customer.creditLimit > 0 || customer.creditBalance > 0) && <p className="text-zinc-600">Owes {customer.creditBalance.toFixed(2)} · limit {customer.creditLimit.toFixed(2)}</p>}
            </div>
            {open && (
              <button type="button" aria-label="Remove customer" className="btn-ghost" disabled={pending} onClick={() => run(() => detachCustomer(orderId))}><X className="size-4" /></button>
            )}
          </div>
        ) : open ? (
          <div className="mt-1 space-y-2">
            {!adding ? (
              <>
                <input className="input" placeholder="Find by name or phone…" value={query} onChange={(e) => search(e.target.value)} />
                {hits.length > 0 && (
                  <ul className="divide-y rounded-lg border text-sm">
                    {hits.map((h) => (
                      <li key={h.id}>
                        <button type="button" className="flex w-full justify-between px-3 py-2 text-left hover:bg-zinc-50" disabled={pending} onClick={() => run(() => attachCustomer(orderId, outletId, { customerId: h.id }), () => { setQuery(""); setHits([]); })}>
                          <span>{h.name} · {h.phone}</span>{loyaltyOn && <span className="text-zinc-500">{h.points} pts</span>}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <button type="button" className="text-sm underline" onClick={() => setAdding(true)}>New customer</button>
              </>
            ) : (
              <>
                <input className="input" placeholder="Name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
                <input className="input" inputMode="tel" placeholder="Phone" value={phone} maxLength={20} onChange={(e) => setPhone(e.target.value)} />
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={isBiz} onChange={(e) => setIsBiz(e.target.checked)} /> Business customer (tax invoice)</label>
                {isBiz && (
                  <>
                    <input className="input" placeholder="Business name" value={bizName} maxLength={120} onChange={(e) => setBizName(e.target.value)} />
                    <input className="input" placeholder="Business TIN (GST number)" value={tin} maxLength={40} onChange={(e) => setTin(e.target.value)} />
                  </>
                )}
                {loyaltyOn && <input className="input" placeholder="Referral code (if a friend gave one)" value={ref} maxLength={10} onChange={(e) => setRef(e.target.value.toUpperCase())} />}
                <div className="flex gap-2">
                  <button type="button" className="btn-primary" disabled={pending || !name || !phone || (isBiz && (!bizName || !tin))} onClick={() => run(() => attachCustomer(orderId, outletId, { name, phone, referralCode: ref || undefined, business: isBiz ? { businessName: bizName, tin } : undefined }), () => { setAdding(false); setName(""); setPhone(""); setRef(""); setIsBiz(false); setBizName(""); setTin(""); })}>Save & add</button>
                  <button type="button" className="btn-outline" onClick={() => setAdding(false)}>Cancel</button>
                </div>
              </>
            )}
          </div>
        ) : (
          <p className="mt-1 text-sm text-zinc-500">No customer on this order.</p>
        )}
      </section>

      {isDelivery && (
        <section className="card p-3">
          <p className="flex items-center gap-1.5 text-sm font-semibold"><Bike className="size-4" /> Delivery {delivery.status && <span className="font-normal text-zinc-600">· {STATUS_LABEL[delivery.status]}{driverName ? ` · ${driverName}` : ""}</span>}</p>
          {open || delivery.status !== "delivered" ? (
            <div className="mt-1 space-y-2">
              <select className="input" value={driver} onChange={(e) => setDriver(e.target.value)}>
                <option value="">Who is delivering?</option>
                {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <input className="input" placeholder="Delivery address" value={address} maxLength={300} onChange={(e) => setAddress(e.target.value)} />
              <div className="flex flex-wrap gap-2">
                {(["assigned", "out", "delivered"] as const).map((st) => (
                  <button key={st} type="button" className="btn-outline" disabled={pending || (!driver && !delivery.by)} onClick={() => run(() => assignDelivery(orderId, driver || null, address, st))}>
                    {st === "assigned" ? "Assign" : st === "out" ? "Out for delivery" : "Delivered"}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            delivery.address && <p className="mt-1 text-sm text-zinc-600">{delivery.address}</p>
          )}
        </section>
      )}
      {err && <p className="text-sm text-red-600 md:col-span-2" role="alert">{err}</p>}
    </div>
  );
}
