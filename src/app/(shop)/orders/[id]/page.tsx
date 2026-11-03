import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getBankDetails } from "@/config/store";
import { SLIP_BUCKET } from "@/lib/storage";
import { formatDate, formatPrice } from "@/lib/utils";
import { StatusBadge } from "@/components/status-badge";
import { OrderTimeline } from "@/components/order-timeline";
import { OrderItems } from "@/components/order-items";
import { CopyButton } from "@/components/copy-button";
import { SlipUpload } from "./slip-upload";
import type { Order, OrderItem } from "@/lib/types";

export const metadata: Metadata = { title: "Order details" };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ placed?: string }> };

export default async function OrderPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { placed } = await searchParams;
  if (!z.string().uuid().safeParse(id).success) notFound();

  const user = await requireUser(`/orders/${id}`);
  const supabase = await createClient();

  const { data: orderData } = await supabase
    .from("orders")
    .select("*, order_items(*)")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!orderData) notFound();

  const order = orderData as Order & { order_items: OrderItem[] };
  const bank = getBankDetails();
  const canUpload = order.status === "pending" || order.status === "slip_uploaded";

  let slipUrl: string | null = null;
  if (order.slip_path) {
    const { data } = await supabase.storage.from(SLIP_BUCKET).createSignedUrl(order.slip_path, 600);
    slipUrl = data?.signedUrl ?? null;
  }

  return (
    <div className="container-page max-w-4xl py-10">
      <Link href="/orders" className="inline-flex items-center gap-1.5 text-sm text-zinc-600 hover:text-zinc-900">
        <ArrowLeft className="size-4" /> All orders
      </Link>

      {placed && (
        <div className="mt-6 flex gap-3 rounded-xl bg-green-50 p-4 text-sm text-green-900 ring-1 ring-green-200">
          <CheckCircle2 className="size-5 shrink-0" />
          <p>
            <strong>Thank you! Your order has been placed.</strong> Please transfer the total below and upload your
            receipt to confirm it.
          </p>
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Order {order.order_number}</h1>
          <p className="text-sm text-zinc-500">Placed {formatDate(order.created_at, true)}</p>
        </div>
        <StatusBadge status={order.status} handover={order.handover_method} className="text-sm" />
      </div>

      <div className="mt-8">
        <OrderTimeline status={order.status} collectedFrom={order.handover_method === "collection" ? order.collection_location : null} />
      </div>

      {order.admin_note && (order.status === "rejected" || order.status === "pending") && (
        <p className="mt-6 rounded-xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">
          <strong>Message from the store:</strong> {order.admin_note}
        </p>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          {canUpload && (
            <section className="card p-6">
              <h2 className="font-semibold">Pay by bank transfer</h2>
              <p className="mt-1 text-sm text-zinc-600">
                Transfer <strong>{formatPrice(order.total)}</strong> to the account below and use{" "}
                <strong>{order.order_number}</strong> as the reference.
              </p>
              <dl className="mt-4 divide-y divide-zinc-100 rounded-lg bg-zinc-50 px-4 text-sm">
                <BankRow label="Bank" value={bank.bankName} />
                <BankRow label="Account name" value={bank.accountName} />
                <BankRow label="Account number" value={bank.accountNumber} copy />
                <BankRow label="Amount" value={formatPrice(order.total)} />
                <BankRow label="Reference" value={order.order_number} copy />
              </dl>
              <div className="mt-6">
                <SlipUpload orderId={order.id} hasSlip={Boolean(order.slip_path)} />
              </div>
            </section>
          )}

          <section className="card p-6">
            <h2 className="mb-2 font-semibold">Items</h2>
            <OrderItems order={order} items={order.order_items} />
          </section>
        </div>

        <aside className="space-y-6">
          <section className="card p-6 text-sm">
            <h2 className="font-semibold">Delivery details</h2>
            <p className="mt-3">{order.customer_name}</p>
            <p className="text-zinc-600">{order.phone}</p>
            {order.email && <p className="text-zinc-600">{order.email}</p>}
            <p className="mt-2 whitespace-pre-line text-zinc-600">
              {order.address}
              {"\n"}
              {order.city}
            </p>
            {order.notes && <p className="mt-3 text-zinc-500">Note: {order.notes}</p>}
          </section>

          {slipUrl && (
            <section className="card p-6 text-sm">
              <h2 className="font-semibold">Your receipt</h2>
              {order.slip_uploaded_at && (
                <p className="text-zinc-500">Uploaded {formatDate(order.slip_uploaded_at, true)}</p>
              )}
              <a href={slipUrl} target="_blank" rel="noopener noreferrer" className="mt-3 block">
                {/* eslint-disable-next-line @next/next/no-img-element -- signed, short-lived URL */}
                <img src={slipUrl} alt="Payment receipt" className="max-h-80 w-full rounded-lg border object-contain" />
              </a>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

function BankRow({ label, value, copy }: { label: string; value: string; copy?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <dt className="text-zinc-500">{label}</dt>
      <dd className="flex items-center gap-2 font-medium">
        {value || "—"}
        {copy && value && <CopyButton value={value} />}
      </dd>
    </div>
  );
}
