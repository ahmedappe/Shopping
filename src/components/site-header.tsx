import Link from "next/link";
import { Search, User, LayoutDashboard } from "lucide-react";
import { Logo } from "@/components/logo";
import { getSessionUser } from "@/lib/auth";
import { getCategories } from "@/lib/catalog";
import { getCurrentOutlet } from "@/lib/outlet";
import { OutletSwitcher } from "@/components/outlet-switcher";
import { CartButton } from "@/components/cart-button";
import { MobileMenu } from "@/components/mobile-menu";

export async function SiteHeader() {
  const [user, categories, { outlet, outlets, byDomain }] = await Promise.all([
    getSessionUser(),
    getCategories(),
    getCurrentOutlet(),
  ]);

  // Staff only see their own company's outlets they were given; admins see every outlet.
  const staffOutlets = user?.isAdmin ? outlets : outlets.filter((o) => user?.outletIds.includes(o.id));

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white/90 backdrop-blur">
      <div className="container-page flex h-16 items-center gap-4">
        <MobileMenu categories={categories.map((c) => ({ name: c.name, slug: c.slug }))} />
        <Link href="/" className="shrink-0" aria-label="Kandhufathi home">
          <Logo />
        </Link>
        {outlet && (
          <span className="hidden truncate border-l border-zinc-300 pl-4 text-sm font-medium text-zinc-600 sm:block">
            {outlet.name}
          </span>
        )}

        <nav className="ml-6 hidden items-center gap-5 text-sm font-medium text-zinc-600 lg:flex">
          <Link href="/products" className="hover:text-zinc-900">
            Shop all
          </Link>
          {categories.slice(0, 5).map((c) => (
            <Link key={c.id} href={`/products?category=${c.slug}`} className="hover:text-zinc-900">
              {c.name}
            </Link>
          ))}
        </nav>

        <form action="/products" className="relative ml-auto hidden w-full max-w-xs md:block" role="search">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-zinc-400" />
          <input
            name="q"
            type="search"
            placeholder="Search products"
            aria-label="Search products"
            className="input rounded-full bg-zinc-50 py-2 pl-9"
            maxLength={80}
          />
        </form>

        <div className="ml-auto flex items-center gap-1 md:ml-2">
          {!byDomain && user?.canEditCatalog && outlet && staffOutlets.length > 1 && (
            <OutletSwitcher outlets={staffOutlets.map((o) => ({ slug: o.slug, name: o.name }))} currentSlug={outlet.slug} />
          )}
          <Link href="/products" className="btn-ghost px-2.5 md:hidden" aria-label="Search">
            <Search className="size-5" />
          </Link>
          {user?.canEditCatalog && (
            <Link href="/admin" className="btn-ghost px-2.5" aria-label="Admin" title="Admin">
              <LayoutDashboard className="size-5" />
            </Link>
          )}
          <Link
            href={user ? "/orders" : "/login"}
            className="btn-ghost px-2.5"
            aria-label={user ? "My orders" : "Sign in"}
            title={user ? "My orders" : "Sign in"}
          >
            <User className="size-5" />
          </Link>
          <CartButton />
        </div>
      </div>
    </header>
  );
}
