import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function Pagination({
  page,
  pageCount,
  basePath,
  params,
}: {
  page: number;
  pageCount: number;
  basePath: string;
  params: Record<string, string | undefined>;
}) {
  if (pageCount <= 1) return null;

  const href = (p: number) => {
    const sp = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => v && k !== "page" && sp.set(k, v));
    if (p > 1) sp.set("page", String(p));
    const qs = sp.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };

  return (
    <nav className="mt-12 flex items-center justify-center gap-2" aria-label="Pagination">
      {page > 1 ? (
        <Link href={href(page - 1)} className="btn-outline px-3" aria-label="Previous page">
          <ChevronLeft className="size-4" />
        </Link>
      ) : (
        <span className="btn-outline px-3 opacity-40" aria-hidden>
          <ChevronLeft className="size-4" />
        </span>
      )}
      <span className="px-3 text-sm text-zinc-600">
        Page {page} of {pageCount}
      </span>
      {page < pageCount ? (
        <Link href={href(page + 1)} className="btn-outline px-3" aria-label="Next page">
          <ChevronRight className="size-4" />
        </Link>
      ) : (
        <span className="btn-outline px-3 opacity-40" aria-hidden>
          <ChevronRight className="size-4" />
        </span>
      )}
    </nav>
  );
}
