import type { Metadata } from "next";
import { CartView } from "./cart-view";

export const metadata: Metadata = { title: "Cart" };

export default function CartPage() {
  return (
    <div className="container-page py-10">
      <h1 className="text-3xl font-bold tracking-tight">Your cart</h1>
      <CartView />
    </div>
  );
}
