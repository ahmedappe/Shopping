"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Lock } from "lucide-react";
import { cartSubtotal, useCart } from "@/store/cart";
import { useHydrated } from "@/lib/use-hydrated";
import { formatPrice } from "@/lib/utils";
import { placeOrder } from "./actions";

export function CheckoutForm({
  defaults,
  deliveryFee,
  freeDeliveryThreshold,
}: {
  defaults: { customerName: string; phone: string; email: string };
  deliveryFee: number;
  freeDeliveryThreshold: number | null;
}) {
  const router = useRouter();
  const hydrated = useHydrated();
  const { items, clear } = useCart();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!hydrated) return <div className="mt-8 h-64 animate-pulse rounded-xl bg-zinc-100" />;

  if (items.length === 0) {
    return (
      <div className="mt-8 rounded-xl border border-dashed border-zinc-300 p-12 text-center">
        <p className="font-medium">Your cart is empty</p>
        <Link href="/products" className="btn-primary mt-5">
          Browse products
        </Link>
      </div>
    );
  }

  const subtotal = cartSubtotal(items);
  const fee = freeDeliveryThreshold != null && subtotal >= freeDeliveryThreshold ? 0 : deliveryFee;

  function onSubmit(formData: FormData) {
    setError(null);
    const payload = {
      customerName: String(formData.get("customerName") ?? ""),
      phone: String(formData.get("phone") ?? ""),
      email: String(formData.get("email") ?? ""),
      address: String(formData.get("address") ?? ""),
      city: String(formData.get("city") ?? ""),
      notes: String(formData.get("notes") ?? ""),
      items: items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })),
    };
    startTransition(async () => {
      const res = await placeOrder(payload);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      clear();
      router.push(`/orders/${res.orderId}?placed=1`);
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(new FormData(e.currentTarget));
      }}
      className="mt-8 grid gap-10 lg:grid-cols-[1fr_380px]"
    >
      <div className="space-y-8">
        <section className="card p-6">
          <h2 className="font-semibold">Contact</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Full name" name="customerName" defaultValue={defaults.customerName} autoComplete="name" required />
            <Field label="Phone" name="phone" type="tel" defaultValue={defaults.phone} autoComplete="tel" required />
            <div className="sm:col-span-2">
              <Field label="Email (optional)" name="email" type="email" defaultValue={defaults.email} autoComplete="email" />
            </div>
          </div>
        </section>

        <section className="card p-6">
          <h2 className="font-semibold">Delivery</h2>
          <div className="mt-4 grid gap-4">
            <Field label="Island / City" name="city" autoComplete="address-level2" required />
            <div>
              <label htmlFor="address" className="label">
                Address
              </label>
              <textarea
                id="address"
                name="address"
                rows={3}
                required
                minLength={5}
                maxLength={500}
                autoComplete="street-address"
                className="input"
                placeholder="House name, street, floor…"
              />
            </div>
            <div>
              <label htmlFor="notes" className="label">
                Order notes (optional)
              </label>
              <textarea id="notes" name="notes" rows={2} maxLength={1000} className="input" />
            </div>
          </div>
        </section>

        <section className="card p-6">
          <h2 className="font-semibold">Payment</h2>
          <p className="mt-2 text-sm text-zinc-600">
            Pay by <strong>bank transfer</strong>. After placing your order you&apos;ll see our account details and can
            upload your transfer receipt. We&apos;ll confirm your order once the payment is verified.
          </p>
        </section>
      </div>

      <aside className="card h-fit p-6 lg:sticky lg:top-24">
        <h2 className="font-semibold">Order summary</h2>
        <ul className="mt-4 divide-y divide-zinc-100 text-sm">
          {items.map((i) => (
            <li key={i.variantId} className="flex justify-between gap-4 py-2.5">
              <span>
                {i.name}
                {i.variantName && <span className="text-zinc-500"> · {i.variantName}</span>}
                <span className="text-zinc-500"> × {i.quantity}</span>
              </span>
              <span className="font-medium whitespace-nowrap">{formatPrice(i.price * i.quantity)}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-4 space-y-2 border-t border-zinc-200 pt-4 text-sm">
          <Row label="Subtotal" value={formatPrice(subtotal)} />
          <Row label="Delivery" value={fee === 0 ? "Free" : formatPrice(fee)} />
          <div className="flex justify-between border-t border-zinc-200 pt-3 text-base font-semibold">
            <dt>Total</dt>
            <dd>{formatPrice(subtotal + fee)}</dd>
          </div>
        </dl>
        {freeDeliveryThreshold != null && fee > 0 && (
          <p className="mt-3 text-xs text-zinc-500">
            Free delivery on orders over {formatPrice(freeDeliveryThreshold)}.
          </p>
        )}
        {error && (
          <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700 ring-1 ring-red-200">
            {error}
          </p>
        )}
        <button type="submit" className="btn-primary mt-6 w-full py-3" disabled={isPending}>
          {isPending ? <Loader2 className="size-4 animate-spin" /> : <Lock className="size-4" />}
          {isPending ? "Placing order…" : "Place order"}
        </button>
        <p className="mt-3 text-center text-xs text-zinc-500">Final total is confirmed on the next page.</p>
      </aside>
    </form>
  );
}

function Field({ label, name, ...props }: { label: string; name: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label htmlFor={name} className="label">
        {label}
      </label>
      <input id={name} name={name} className="input" maxLength={200} {...props} />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-zinc-600">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
