import { cn } from "@/lib/utils";
import { STORE } from "@/config/store";

/** Kandhufathi mark: a shopping bag with sea waves. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className={cn("size-8 shrink-0", className)}>
      <path
        d="M22 28V18.5a10 10 0 0 1 20 0V28"
        fill="none"
        stroke="#0d9488"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="M15 22H49a4 4 0 0 1 4 3.6L56 50a8 8 0 0 1-8 9H16a8 8 0 0 1-8-9L11 25.6A4 4 0 0 1 15 22Z"
        fill="#0d9488"
      />
      <circle cx="22" cy="28" r="2.2" fill="#fff" />
      <circle cx="42" cy="28" r="2.2" fill="#fff" />
      <path
        d="M15.5 40c3.5-4.5 7-4.5 10.5 0s7 4.5 10.5 0 7-4.5 10.5 0 3.5 4.5 3.5 4.5"
        fill="none"
        stroke="#fff"
        strokeWidth="3.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M17.5 49c3.5-4.5 7-4.5 10.5 0s7 4.5 10.5 0 7-4.5 10.5 0"
        fill="none"
        stroke="#fff"
        strokeOpacity=".55"
        strokeWidth="3.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Mark + store name, used in the header, footer and admin panel. */
export function Logo({ className, markClassName }: { className?: string; markClassName?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-lg font-bold tracking-tight", className)}>
      <LogoMark className={markClassName} />
      {STORE.name}
    </span>
  );
}
