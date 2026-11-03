import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOutlet } from "@/lib/outlet";
import { CheckoutForm } from "./checkout-form";

export const metadata: Metadata = { title: "Checkout" };

export default async function CheckoutPage() {
  const user = await requireUser("/checkout");
  const supabase = await createClient();
  const { outlet } = await getCurrentOutlet();
  const { data: settings } = await supabase
    .from("store_settings")
    .select("delivery_fee, free_delivery_threshold")
    .eq("id", 1)
    .maybeSingle();

  return (
    <div className="container-page py-10">
      <h1 className="text-3xl font-bold tracking-tight">Checkout</h1>
      <CheckoutForm
        defaults={{ customerName: user.fullName ?? "", phone: user.phone ?? "", email: user.email ?? "" }}
        deliveryFee={outlet?.delivery_fee != null ? outlet.delivery_fee : Number(settings?.delivery_fee ?? 0)}
        freeDeliveryThreshold={
          outlet?.delivery_fee != null
            ? outlet.free_delivery_threshold
            : settings?.free_delivery_threshold != null
              ? Number(settings.free_delivery_threshold)
              : null
        }
      />
    </div>
  );
}
