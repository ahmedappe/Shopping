import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { getCategories } from "@/lib/catalog";
import { ProductForm } from "../product-form";

export const metadata: Metadata = { title: "New product" };

export default async function NewProductPage() {
  await requireAdmin();
  const categories = await getCategories();

  return (
    <div className="max-w-4xl">
      <Link href="/admin/products" className="inline-flex items-center gap-1.5 text-sm text-zinc-600 hover:text-zinc-900">
        <ArrowLeft className="size-4" /> Products
      </Link>
      <h1 className="mt-4 text-2xl font-bold tracking-tight">New product</h1>
      <p className="text-sm text-zinc-500">You can add images after saving.</p>
      <ProductForm categories={categories.map((c) => ({ id: c.id, name: c.name }))} />
    </div>
  );
}
