import Link from "next/link";
import { STORE } from "@/config/store";
import { Logo } from "@/components/logo";

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-zinc-200 bg-zinc-50">
      <div className="container-page grid gap-8 py-12 text-sm text-zinc-600 sm:grid-cols-3">
        <div>
          <Logo className="text-zinc-900" />
          <p className="mt-2 max-w-xs">{STORE.description}</p>
        </div>
        <div>
          <p className="font-semibold text-zinc-900">Shop</p>
          <ul className="mt-3 space-y-2">
            <li><Link href="/products" className="hover:text-zinc-900">All products</Link></li>
            <li><Link href="/products?sort=newest" className="hover:text-zinc-900">New arrivals</Link></li>
            <li><Link href="/cart" className="hover:text-zinc-900">Cart</Link></li>
          </ul>
        </div>
        <div>
          <p className="font-semibold text-zinc-900">Account</p>
          <ul className="mt-3 space-y-2">
            <li><Link href="/orders" className="hover:text-zinc-900">My orders</Link></li>
            <li><Link href="/login" className="hover:text-zinc-900">Sign in</Link></li>
            <li><Link href="/signup" className="hover:text-zinc-900">Create account</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-zinc-200 py-5 text-center text-xs text-zinc-500">
        © {new Date().getFullYear()} {STORE.name}. All rights reserved.
      </div>
    </footer>
  );
}
