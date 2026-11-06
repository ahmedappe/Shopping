"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeftRight, Boxes, Building2, ChefHat, ClipboardList, CookingPot, History, LayoutGrid, LayoutDashboard, MonitorSmartphone, Package, Settings, ShoppingCart, Store, Tags, Truck, Users, Warehouse } from "lucide-react";
import { cn } from "@/lib/utils";

type Role = "customer" | "staff" | "manager" | "admin";

const LINKS = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true, roles: ["manager", "admin"] },
  { href: "/admin/orders", label: "Orders", icon: ShoppingCart, roles: ["manager", "admin"] },
  { href: "/admin/products", label: "Products", icon: Package, roles: ["staff", "manager", "admin"] },
  { href: "/admin/overview", label: "Outlets overview", icon: LayoutGrid, roles: ["manager", "admin"] },
  { href: "/admin/stock", label: "Stock", icon: Boxes, exact: true, roles: ["staff", "manager", "admin"] },
  { href: "/admin/stock/reorder", label: "Reorder list", icon: ClipboardList, roles: ["staff", "manager", "admin"] },
  { href: "/admin/stock/transfers", label: "Transfers", icon: ArrowLeftRight, roles: ["staff", "manager", "admin"] },
  { href: "/godown", label: "Godown tablet", icon: Warehouse, roles: ["staff", "manager", "admin"] },
  { href: "/pos", label: "Cafe POS", icon: MonitorSmartphone, roles: ["staff", "manager", "admin"] },
  { href: "/kitchen", label: "Kitchen / Bar", icon: ChefHat, roles: ["staff", "manager", "admin"] },
  { href: "/admin/recipes", label: "Recipes", icon: CookingPot, roles: ["staff", "manager", "admin"] },
  { href: "/admin/plan", label: "Big order planner", icon: ClipboardList, roles: ["staff", "manager", "admin"] },
  { href: "/admin/gift-cards", label: "Gift cards & currency", icon: ClipboardList, roles: ["manager", "admin"] },
  { href: "/admin/customers", label: "Customers & loyalty", icon: Users, roles: ["staff", "manager", "admin"] },
  { href: "/admin/pos-setup", label: "POS setup", icon: Settings, roles: ["manager", "admin"] },
  { href: "/admin/suppliers", label: "Suppliers", icon: Truck, roles: ["manager", "admin"] },
  { href: "/admin/categories", label: "Categories", icon: Tags, roles: ["staff", "manager", "admin"] },
  { href: "/admin/outlets", label: "Outlets", icon: Building2, roles: ["admin"] },
  { href: "/admin/users", label: "Users", icon: Users, roles: ["admin"] },
  { href: "/admin/audit", label: "Audit log", icon: History, roles: ["admin"] },
] as const;

export function AdminNav({ role }: { role: Role }) {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:pb-0">
      {LINKS.filter((l) => (l.roles as readonly string[]).includes(role)).map(({ href, label, icon: Icon, ...l }) => {
        const active = "exact" in l && l.exact ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium",
              active ? "bg-zinc-900 text-white" : "text-zinc-700 hover:bg-zinc-100",
            )}
          >
            <Icon className="size-4" /> {label}
          </Link>
        );
      })}
      <Link
        href="/"
        className="flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 lg:mt-4"
      >
        <Store className="size-4" /> View store
      </Link>
    </nav>
  );
}
