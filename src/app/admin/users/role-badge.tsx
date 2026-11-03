import { cn } from "@/lib/utils";

const STYLES = {
  admin: "bg-zinc-900 text-white",
  manager: "bg-brand-100 text-brand-900",
  staff: "bg-blue-50 text-blue-800 ring-1 ring-inset ring-blue-200",
  customer: "bg-zinc-100 text-zinc-600",
} as const;

const LABELS = { admin: "Admin", manager: "Manager", staff: "Staff", customer: "Customer" } as const;

export function RoleBadge({ role }: { role: keyof typeof STYLES }) {
  return (
    <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold", STYLES[role] ?? STYLES.customer)}>
      {LABELS[role] ?? role}
    </span>
  );
}

export const ROLE_HELP = {
  customer: "Shops on the website. No admin access.",
  staff: "Can view, add and edit products and categories. Can't see orders or delete anything.",
  manager: "Can do everything — orders, payment slips, products, categories, dashboard — except manage users.",
  admin: "Full access, including creating and managing users.",
} as const;
