import { Check, X } from "lucide-react";
import type { OrderStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const STEPS: { key: OrderStatus; label: string }[] = [
  { key: "pending", label: "Order placed" },
  { key: "slip_uploaded", label: "Receipt uploaded" },
  { key: "approved", label: "Payment approved" },
  { key: "delivered", label: "Delivered" },
];

export function OrderTimeline({ status }: { status: OrderStatus }) {
  if (status === "rejected") {
    return (
      <div className="flex items-center gap-3 rounded-xl bg-red-50 p-4 text-sm text-red-800 ring-1 ring-red-200">
        <X className="size-5" /> This order was rejected. Contact us if you have any questions.
      </div>
    );
  }
  const current = STEPS.findIndex((s) => s.key === status);

  return (
    <ol className="grid grid-cols-4 gap-2">
      {STEPS.map((step, i) => {
        const done = i <= current;
        return (
          <li key={step.key} className="flex flex-col items-center text-center">
            <div className="flex w-full items-center">
              <div className={cn("h-0.5 flex-1", i === 0 ? "invisible" : done ? "bg-brand-600" : "bg-zinc-200")} />
              <span
                className={cn(
                  "grid size-8 shrink-0 place-items-center rounded-full text-xs font-semibold",
                  done ? "bg-brand-600 text-white" : "bg-zinc-100 text-zinc-500",
                )}
              >
                {done ? <Check className="size-4" /> : i + 1}
              </span>
              <div
                className={cn(
                  "h-0.5 flex-1",
                  i === STEPS.length - 1 ? "invisible" : i < current ? "bg-brand-600" : "bg-zinc-200",
                )}
              />
            </div>
            <span className={cn("mt-2 text-xs", done ? "font-medium text-zinc-900" : "text-zinc-500")}>{step.label}</span>
          </li>
        );
      })}
    </ol>
  );
}
