"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SlidersHorizontal, X } from "lucide-react";
import { cn } from "@/lib/utils";

const SORTS = [
  { value: "newest", label: "Newest" },
  { value: "price-asc", label: "Price: low to high" },
  { value: "price-desc", label: "Price: high to low" },
  { value: "name", label: "Name A–Z" },
];

export function ProductFilters({ categories }: { categories: { name: string; slug: string }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  const [q, setQ] = useState(searchParams.get("q") ?? "");
  const [min, setMin] = useState(searchParams.get("min") ?? "");
  const [max, setMax] = useState(searchParams.get("max") ?? "");

  useEffect(() => {
    setQ(searchParams.get("q") ?? "");
    setMin(searchParams.get("min") ?? "");
    setMax(searchParams.get("max") ?? "");
  }, [searchParams]);

  function update(changes: Record<string, string | null>) {
    const sp = new URLSearchParams(searchParams.toString());
    Object.entries(changes).forEach(([k, v]) => (v ? sp.set(k, v) : sp.delete(k)));
    sp.delete("page");
    startTransition(() => router.push(`${pathname}?${sp.toString()}`, { scroll: false }));
  }

  // Debounced text search
  useEffect(() => {
    const current = searchParams.get("q") ?? "";
    if (q === current) return;
    const t = setTimeout(() => update({ q: q.trim() || null }), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const category = searchParams.get("category") ?? "";
  const sort = searchParams.get("sort") ?? "newest";
  const inStock = searchParams.get("inStock") === "1";
  const hasFilters = Boolean(category || searchParams.get("q") || searchParams.get("min") || searchParams.get("max") || inStock);

  return (
    <aside className={cn("transition-opacity", isPending && "opacity-60")}>
      <button type="button" className="btn-outline w-full lg:hidden" onClick={() => setOpen((o) => !o)}>
        <SlidersHorizontal className="size-4" /> {open ? "Hide filters" : "Filters & sort"}
      </button>

      <div className={cn("mt-4 space-y-7 lg:mt-0 lg:block", open ? "block" : "hidden")}>
        <div>
          <label htmlFor="filter-q" className="label">
            Search
          </label>
          <input
            id="filter-q"
            type="search"
            className="input"
            placeholder="Product name…"
            value={q}
            maxLength={80}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        <div>
          <label htmlFor="filter-sort" className="label">
            Sort by
          </label>
          <select id="filter-sort" className="input" value={sort} onChange={(e) => update({ sort: e.target.value })}>
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        <fieldset>
          <legend className="label">Category</legend>
          <div className="space-y-1">
            <CategoryButton active={!category} onClick={() => update({ category: null })}>
              All
            </CategoryButton>
            {categories.map((c) => (
              <CategoryButton key={c.slug} active={category === c.slug} onClick={() => update({ category: c.slug })}>
                {c.name}
              </CategoryButton>
            ))}
          </div>
        </fieldset>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            update({ min: min || null, max: max || null });
          }}
        >
          <p className="label">Price</p>
          <div className="flex items-center gap-2">
            <input
              type="number"
              inputMode="decimal"
              min={0}
              placeholder="Min"
              aria-label="Minimum price"
              className="input"
              value={min}
              onChange={(e) => setMin(e.target.value)}
            />
            <span className="text-zinc-400">–</span>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              placeholder="Max"
              aria-label="Maximum price"
              className="input"
              value={max}
              onChange={(e) => setMax(e.target.value)}
            />
          </div>
          <button type="submit" className="btn-outline mt-2 w-full py-2">
            Apply
          </button>
        </form>

        <label className="flex cursor-pointer items-center gap-2.5 text-sm">
          <input
            type="checkbox"
            className="size-4 rounded border-zinc-300 accent-brand-600"
            checked={inStock}
            onChange={(e) => update({ inStock: e.target.checked ? "1" : null })}
          />
          In stock only
        </label>

        {hasFilters && (
          <button
            type="button"
            className="btn-ghost w-full"
            onClick={() => startTransition(() => router.push(pathname))}
          >
            <X className="size-4" /> Clear all filters
          </button>
        )}
      </div>
    </aside>
  );
}

function CategoryButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "block w-full rounded-lg px-3 py-2 text-left text-sm",
        active ? "bg-zinc-900 font-medium text-white" : "text-zinc-700 hover:bg-zinc-100",
      )}
    >
      {children}
    </button>
  );
}
