import Image from "next/image";
import { OUTLET_LOGOS } from "@/config/outlet-brands";
import { Logo } from "@/components/logo";
import { cn } from "@/lib/utils";

/** The outlet's own logo and name. Falls back to the store logo only if there is no outlet. */
export function OutletBrand({ outlet, className }: { outlet: { name: string; slug: string } | null; className?: string }) {
  if (!outlet) return <Logo className={className} />;
  const logo = OUTLET_LOGOS[outlet.slug];
  return (
    <span className={cn("inline-flex items-center gap-2.5 font-bold tracking-tight", className)}>
      {logo && <Image src={logo} alt="" width={56} height={33} unoptimized className="h-8 w-auto shrink-0" />}
      <span className="truncate">{outlet.name}</span>
    </span>
  );
}
