"use client";

import { useTransition } from "react";
import { Store } from "lucide-react";
import { switchOutlet } from "@/app/outlet/actions";

/**
 * Lets someone pick an outlet. Only shown on domains that are not tied to one outlet
 * (for example the default Vercel address, used for testing).
 */
export function OutletSwitcher({
  outlets,
  currentSlug,
}: {
  outlets: { slug: string; name: string }[];
  currentSlug: string;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <label className="flex items-center gap-1.5 text-sm text-zinc-600">
      <Store className="size-4" aria-hidden="true" />
      <span className="sr-only">Outlet</span>
      <select
        className="rounded-md border border-zinc-300 bg-white py-1 pr-6 pl-2 text-sm"
        value={currentSlug}
        disabled={pending}
        onChange={(e) => startTransition(() => switchOutlet(e.target.value))}
      >
        {outlets.map((o) => (
          <option key={o.slug} value={o.slug}>
            {o.name}
          </option>
        ))}
      </select>
    </label>
  );
}
