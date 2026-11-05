import "server-only";
import { redirect } from "next/navigation";
import { getAdminOutlets } from "@/lib/admin-outlets";
import type { SessionUser } from "@/lib/auth";
import type { Outlet } from "@/lib/types";

export const POS_ERRORS: Record<string, string> = {
  FORBIDDEN: "You don't have access to this outlet.",
  BAD_TYPE: "Choose dine in, take away or delivery.",
  TABLE_NOT_FOUND: "Table not found.",
  ORDER_NOT_FOUND: "Order not found.",
  ORDER_CLOSED: "This order is already closed.",
  NO_LINES: "Add at least one item.",
  TOO_MANY_LINES: "Too many items at once.",
  BAD_QUANTITY: "Quantity must be between 1 and 999.",
  ITEM_NOT_AVAILABLE: "This item is not available at this outlet.",
  NOT_ENOUGH_STOCK: "Not enough stock for that item.",
  ITEM_NOT_FOUND: "Item not found.",
  BAD_STATUS: "Invalid status.",
  MANAGER_ONLY: "A manager needs to do this.",
  EMPTY_ORDER: "The order has no items.",
  BAD_DISCOUNT: "That discount is not valid.",
  NO_PAYMENT: "Enter the payment.",
  BAD_METHOD: "Choose cash, card or transfer.",
  REFERENCE_REQUIRED: "Enter the card or transfer reference number.",
  UNDERPAID: "The payments are less than the total.",
  OVERPAID_NON_CASH: "Card and transfer cannot be more than the total. Only cash gives change.",
};

export function posError(message: string) {
  const key = Object.keys(POS_ERRORS).find((k) => message.includes(k));
  return key ? POS_ERRORS[key] : "Something went wrong. Please try again.";
}

/** Picks the outlet from ?outlet=<slug>, or the only one the user has. Redirects to the chooser when unclear. */
export async function resolvePosOutlet(user: SessionUser, slug: string | undefined, base: string) {
  const outlets = await getAdminOutlets(user);
  const outlet: Outlet | null = outlets.find((o) => o.slug === slug) ?? (outlets.length === 1 ? outlets[0] : null);
  return { outlets, outlet, base };
}

export function chooseRedirect(path: string): never {
  redirect(path);
}

