import { ORDER_STATUS_META } from "@/config/store";
import type { OrderStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const toneClasses = {
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  blue: "bg-blue-50 text-blue-800 ring-blue-200",
  green: "bg-green-50 text-green-800 ring-green-200",
  emerald: "bg-emerald-100 text-emerald-900 ring-emerald-300",
  red: "bg-red-50 text-red-800 ring-red-200",
} as const;

export function StatusBadge({
  status,
  handover,
  className,
}: {
  status: OrderStatus;
  handover?: "delivery" | "collection" | null;
  className?: string;
}) {
  const meta =
    status === "delivered" && handover === "collection"
      ? ({ label: "Collected", tone: "emerald" } as const)
      : ORDER_STATUS_META[status];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset whitespace-nowrap",
        toneClasses[meta.tone],
        className,
      )}
    >
      {meta.label}
    </span>
  );
}
