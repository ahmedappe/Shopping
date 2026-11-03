"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2, Wand2 } from "lucide-react";
import { slugify } from "@/lib/utils";
import { saveProduct } from "./actions";

type VariantRow = {
  key: string;
  id?: string;
  option1: string;
  option2: string;
  sku: string;
  price: string;
  stock: string;
  isActive: boolean;
};

export type ProductFormValues = {
  id: string;
  name: string;
  slug: string;
  description: string;
  categoryId: string;
  compareAtPrice: string;
  option1Name: string;
  option2Name: string;
  isActive: boolean;
  isFeatured: boolean;
  variants: Omit<VariantRow, "key">[];
};

let keySeq = 0;
const newKey = () => `v${++keySeq}`;
const emptyVariant = (): VariantRow => ({
  key: newKey(),
  option1: "",
  option2: "",
  sku: "",
  price: "",
  stock: "0",
  isActive: true,
});

export function ProductForm({
  categories,
  product,
}: {
  categories: { id: string; name: string }[];
  product?: ProductFormValues;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const [name, setName] = useState(product?.name ?? "");
  const [slug, setSlug] = useState(product?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(Boolean(product));
  const [description, setDescription] = useState(product?.description ?? "");
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? "");
  const [compareAtPrice, setCompareAtPrice] = useState(product?.compareAtPrice ?? "");
  const [option1Name, setOption1Name] = useState(product?.option1Name ?? "");
  const [option2Name, setOption2Name] = useState(product?.option2Name ?? "");
  const [isActive, setIsActive] = useState(product?.isActive ?? true);
  const [isFeatured, setIsFeatured] = useState(product?.isFeatured ?? false);
  const [variants, setVariants] = useState<VariantRow[]>(
    product?.variants.length ? product.variants.map((v) => ({ ...v, key: newKey() })) : [emptyVariant()],
  );
  const [gen1, setGen1] = useState("");
  const [gen2, setGen2] = useState("");

  const updateVariant = (key: string, patch: Partial<VariantRow>) =>
    setVariants((vs) => vs.map((v) => (v.key === key ? { ...v, ...patch } : v)));

  function generateVariants() {
    const list = (s: string) => [...new Set(s.split(",").map((x) => x.trim()).filter(Boolean))];
    const a = list(gen1);
    const b = option2Name ? list(gen2) : [""];
    if (a.length === 0 || (option2Name && b.length === 0)) return;
    const basePrice = variants.find((v) => v.price)?.price ?? "";
    const existing = new Map(variants.map((v) => [`${v.option1.toLowerCase()}|${v.option2.toLowerCase()}`, v]));
    const next: VariantRow[] = [];
    for (const o1 of a)
      for (const o2 of b) {
        const found = existing.get(`${o1.toLowerCase()}|${o2.toLowerCase()}`);
        next.push(found ?? { ...emptyVariant(), option1: o1, option2: o2, price: basePrice });
      }
    setVariants(next);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    const payload = {
      name,
      slug,
      description,
      categoryId,
      compareAtPrice,
      option1Name,
      option2Name: option1Name ? option2Name : "",
      isActive,
      isFeatured,
      variants: variants.map((v) => ({
        id: v.id,
        option1: option1Name ? v.option1 : "",
        option2: option1Name && option2Name ? v.option2 : "",
        sku: v.sku,
        price: v.price,
        stock: v.stock,
        isActive: v.isActive,
      })),
    };
    startTransition(async () => {
      const res = await saveProduct(product?.id ?? null, payload);
      if (!res.ok) {
        setMessage({ ok: false, text: res.error });
        return;
      }
      if (!product) {
        router.push(`/admin/products/${res.id}`);
      } else {
        setMessage({ ok: true, text: "Saved." });
        router.refresh();
      }
    });
  }

  const hasOptions = Boolean(option1Name.trim());

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-6">
      <section className="card grid gap-4 p-5 sm:grid-cols-2">
        <h2 className="font-semibold sm:col-span-2">Details</h2>
        <div className="sm:col-span-2">
          <label htmlFor="p-name" className="label">
            Name
          </label>
          <input
            id="p-name"
            required
            maxLength={160}
            className="input"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (!slugTouched) setSlug(slugify(e.target.value));
            }}
          />
        </div>
        <div>
          <label htmlFor="p-slug" className="label">
            URL slug
          </label>
          <input
            id="p-slug"
            required
            maxLength={80}
            className="input"
            value={slug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(e.target.value.toLowerCase());
            }}
          />
        </div>
        <div>
          <label htmlFor="p-cat" className="label">
            Category
          </label>
          <select id="p-cat" className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">— None —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="p-desc" className="label">
            Description
          </label>
          <textarea
            id="p-desc"
            rows={5}
            maxLength={5000}
            className="input"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="p-compare" className="label">
            Compare-at price <span className="font-normal text-zinc-400">(shows as “was” price)</span>
          </label>
          <input
            id="p-compare"
            type="number"
            min={0}
            step="0.01"
            inputMode="decimal"
            className="input"
            value={compareAtPrice}
            onChange={(e) => setCompareAtPrice(e.target.value)}
          />
        </div>
        <div className="flex flex-col justify-end gap-2 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" className="size-4 accent-brand-600" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            Visible in store
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              className="size-4 accent-brand-600"
              checked={isFeatured}
              onChange={(e) => setIsFeatured(e.target.checked)}
            />
            Featured on home page
          </label>
        </div>
      </section>

      <section className="card p-5">
        <h2 className="font-semibold">Variants, default price & starting stock</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Leave option names empty for a simple product with one price. Add e.g. “Size” and “Color” for variants. The price and stock here are the starting values for your outlets when a variant is first added; after saving, set each outlet&apos;s own price and stock in “Prices & stock by outlet”.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="opt1" className="label">
              Option 1 name
            </label>
            <input
              id="opt1"
              maxLength={40}
              placeholder="e.g. Size"
              className="input"
              value={option1Name}
              onChange={(e) => setOption1Name(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="opt2" className="label">
              Option 2 name
            </label>
            <input
              id="opt2"
              maxLength={40}
              placeholder="e.g. Color"
              className="input"
              value={option2Name}
              disabled={!hasOptions}
              onChange={(e) => setOption2Name(e.target.value)}
            />
          </div>
        </div>

        {hasOptions && (
          <div className="mt-4 rounded-lg bg-zinc-50 p-4">
            <p className="text-sm font-medium">Quick generate</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <input
                className="input"
                placeholder={`${option1Name} values, comma separated (S, M, L)`}
                value={gen1}
                onChange={(e) => setGen1(e.target.value)}
              />
              <input
                className="input"
                placeholder={option2Name ? `${option2Name} values (Red, Blue)` : "—"}
                disabled={!option2Name}
                value={gen2}
                onChange={(e) => setGen2(e.target.value)}
              />
              <button type="button" className="btn-outline" onClick={generateVariants}>
                <Wand2 className="size-4" /> Generate
              </button>
            </div>
          </div>
        )}

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[620px] text-sm">
            <thead className="text-left text-xs text-zinc-500">
              <tr>
                {hasOptions && <th className="pb-2 pr-2 font-medium">{option1Name}</th>}
                {hasOptions && option2Name && <th className="pb-2 pr-2 font-medium">{option2Name}</th>}
                <th className="pb-2 pr-2 font-medium">Default price</th>
                <th className="pb-2 pr-2 font-medium">Starting stock</th>
                <th className="pb-2 pr-2 font-medium">SKU</th>
                <th className="pb-2 pr-2 font-medium">Active</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {variants.map((v) => (
                <tr key={v.key}>
                  {hasOptions && (
                    <td className="py-1 pr-2">
                      <input
                        className="input py-2"
                        required
                        maxLength={60}
                        value={v.option1}
                        onChange={(e) => updateVariant(v.key, { option1: e.target.value })}
                        aria-label={option1Name}
                      />
                    </td>
                  )}
                  {hasOptions && option2Name && (
                    <td className="py-1 pr-2">
                      <input
                        className="input py-2"
                        required
                        maxLength={60}
                        value={v.option2}
                        onChange={(e) => updateVariant(v.key, { option2: e.target.value })}
                        aria-label={option2Name}
                      />
                    </td>
                  )}
                  <td className="py-1 pr-2">
                    <input
                      className="input py-2"
                      type="number"
                      min={0}
                      step="0.01"
                      inputMode="decimal"
                      required
                      value={v.price}
                      onChange={(e) => updateVariant(v.key, { price: e.target.value })}
                      aria-label="Price"
                    />
                  </td>
                  <td className="py-1 pr-2">
                    <input
                      className="input w-24 py-2"
                      type="number"
                      min={0}
                      step="1"
                      inputMode="numeric"
                      required
                      value={v.stock}
                      onChange={(e) => updateVariant(v.key, { stock: e.target.value })}
                      aria-label="Stock"
                    />
                  </td>
                  <td className="py-1 pr-2">
                    <input
                      className="input py-2"
                      maxLength={64}
                      value={v.sku}
                      onChange={(e) => updateVariant(v.key, { sku: e.target.value })}
                      aria-label="SKU"
                    />
                  </td>
                  <td className="py-1 pr-2 text-center">
                    <input
                      type="checkbox"
                      className="size-4 accent-brand-600"
                      checked={v.isActive}
                      onChange={(e) => updateVariant(v.key, { isActive: e.target.checked })}
                      aria-label="Active"
                    />
                  </td>
                  <td className="py-1">
                    <button
                      type="button"
                      className="btn-ghost px-2 text-zinc-500"
                      disabled={variants.length <= 1}
                      onClick={() => setVariants((vs) => vs.filter((x) => x.key !== v.key))}
                      aria-label="Remove variant"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {hasOptions && (
          <button type="button" className="btn-ghost mt-2" onClick={() => setVariants((vs) => [...vs, emptyVariant()])}>
            <Plus className="size-4" /> Add variant
          </button>
        )}
      </section>

      <div className="sticky bottom-0 -mx-4 flex items-center justify-end gap-4 border-t border-zinc-200 bg-zinc-50/95 px-4 py-4 backdrop-blur sm:mx-0 sm:rounded-xl sm:border">
        {message && (
          <p role="status" className={`text-sm ${message.ok ? "text-green-700" : "text-red-600"}`}>
            {message.text}
          </p>
        )}
        <button type="submit" className="btn-primary px-6" disabled={isPending}>
          {isPending && <Loader2 className="size-4 animate-spin" />}
          {product ? "Save changes" : "Create product"}
        </button>
      </div>
    </form>
  );
}
