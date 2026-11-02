import Link from "next/link";
import { ArrowRight, ShieldCheck, Truck, Receipt } from "lucide-react";
import { STORE } from "@/config/store";
import { getCategories, getFeaturedProducts, getNewArrivals } from "@/lib/catalog";
import { ProductGrid } from "@/components/product-card";

export default async function HomePage() {
  const [categories, featured, newest] = await Promise.all([
    getCategories(),
    getFeaturedProducts(8),
    getNewArrivals(8),
  ]);

  return (
    <>
      <section className="border-b border-zinc-200 bg-gradient-to-b from-brand-50 to-white">
        <div className="container-page py-16 sm:py-24">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold tracking-wide text-brand-700 uppercase">New season</p>
            <h1 className="mt-3 text-4xl font-bold tracking-tight text-balance sm:text-5xl">
              {STORE.description}
            </h1>
            <p className="mt-4 text-lg text-zinc-600">
              Browse our latest collection, order in a few taps and pay by bank transfer.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/products" className="btn-primary px-6 py-3">
                Shop now <ArrowRight className="size-4" />
              </Link>
              {categories[0] && (
                <Link href={`/products?category=${categories[0].slug}`} className="btn-outline px-6 py-3">
                  {categories[0].name}
                </Link>
              )}
            </div>
          </div>
        </div>
      </section>

      {categories.length > 0 && (
        <section className="container-page mt-14">
          <h2 className="text-xl font-bold tracking-tight">Shop by category</h2>
          <div className="mt-5 flex gap-3 overflow-x-auto pb-2">
            {categories.map((c) => (
              <Link
                key={c.id}
                href={`/products?category=${c.slug}`}
                className="shrink-0 rounded-full border border-zinc-200 px-5 py-2.5 text-sm font-medium hover:border-zinc-900"
              >
                {c.name}
              </Link>
            ))}
          </div>
        </section>
      )}

      {featured.length > 0 && (
        <section className="container-page mt-14">
          <SectionHeader title="Featured" href="/products" />
          <ProductGrid products={featured} />
        </section>
      )}

      <section className="container-page mt-14">
        <SectionHeader title="New arrivals" href="/products?sort=newest" />
        {newest.length > 0 ? (
          <ProductGrid products={newest} />
        ) : (
          <p className="rounded-xl border border-dashed border-zinc-300 p-10 text-center text-zinc-500">
            No products yet. Add some from the admin panel.
          </p>
        )}
      </section>

      <section className="container-page mt-20 grid gap-6 sm:grid-cols-3">
        {[
          { icon: Receipt, title: "Simple payment", text: "Pay by bank transfer and upload your receipt." },
          { icon: ShieldCheck, title: "Verified orders", text: "Every payment is checked by our team." },
          { icon: Truck, title: "Fast delivery", text: "We deliver as soon as your payment is approved." },
        ].map(({ icon: Icon, title, text }) => (
          <div key={title} className="card flex gap-4 p-5">
            <Icon className="size-6 shrink-0 text-brand-600" />
            <div>
              <p className="font-semibold">{title}</p>
              <p className="mt-1 text-sm text-zinc-600">{text}</p>
            </div>
          </div>
        ))}
      </section>
    </>
  );
}

function SectionHeader({ title, href }: { title: string; href: string }) {
  return (
    <div className="mb-6 flex items-end justify-between">
      <h2 className="text-xl font-bold tracking-tight">{title}</h2>
      <Link href={href} className="text-sm font-medium text-brand-700 hover:underline">
        View all
      </Link>
    </div>
  );
}
