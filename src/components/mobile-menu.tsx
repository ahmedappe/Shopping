"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";

export function MobileMenu({ categories }: { categories: { name: string; slug: string }[] }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <div className="lg:hidden">
      <button type="button" className="btn-ghost -ml-2 px-2" onClick={() => setOpen(true)} aria-label="Open menu">
        <Menu className="size-5" />
      </button>
      {open && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-80 max-w-[85%] flex-col bg-white p-5 shadow-xl">
            <div className="mb-6 flex items-center justify-between">
              <span className="font-semibold">Menu</span>
              <button type="button" className="btn-ghost px-2" onClick={() => setOpen(false)} aria-label="Close menu">
                <X className="size-5" />
              </button>
            </div>
            <form action="/products" className="mb-6" role="search">
              <input name="q" type="search" placeholder="Search products" className="input" maxLength={80} />
            </form>
            <nav className="flex flex-col gap-1 text-sm font-medium">
              <Link href="/products" className="rounded-lg px-3 py-2.5 hover:bg-zinc-100">
                Shop all
              </Link>
              {categories.map((c) => (
                <Link key={c.slug} href={`/products?category=${c.slug}`} className="rounded-lg px-3 py-2.5 hover:bg-zinc-100">
                  {c.name}
                </Link>
              ))}
              <hr className="my-3 border-zinc-200" />
              <Link href="/orders" className="rounded-lg px-3 py-2.5 hover:bg-zinc-100">
                My orders
              </Link>
              <Link href="/cart" className="rounded-lg px-3 py-2.5 hover:bg-zinc-100">
                Cart
              </Link>
            </nav>
          </div>
        </div>
      )}
    </div>
  );
}
