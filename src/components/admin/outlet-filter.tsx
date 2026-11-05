import Link from "next/link";
import { cn } from "@/lib/utils";
import type { Outlet } from "@/lib/types";

/** Row of links to switch an admin list between outlets. Hidden when there is only one choice. */
export function OutletFilter({
  outlets,
  selectedSlug,
  basePath,
  params = {},
  allLabel = "All outlets",
}: {
  outlets: Outlet[];
  selectedSlug?: string;
  basePath: string;
  params?: Record<string, string | undefined>;
  allLabel?: string;
}) {
  if (outlets.length < 2) return null;
  const href = (slug?: string) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
    if (slug) sp.set("outlet", slug);
    const qs = sp.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };
  const item = (label: string, slug?: string) => (
    <Link
      key={slug ?? "all"}
      href={href(slug)}
      className={cn(
        "shrink-0 rounded-full border px-3 py-1 text-sm",
        (selectedSlug ?? undefined) === slug
          ? "border-brand-600 bg-brand-50 font-medium text-brand-800"
          : "border-zinc-200 text-zinc-600 hover:bg-zinc-100",
      )}
    >
      {label}
    </Link>
  );
  return (
    <div className="flex flex-wrap gap-2">
      {allLabel !== "" && item(allLabel)}
      {outlets.map((o) => item(o.name, o.slug))}
    </div>
  );
}
