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
  NOT_ADVANCE_ITEM: "This item is not set as made in advance. Turn it on in POS setup.",
  BAD_KIND: "Invalid entry.",
  NO_CASH_SESSION: "Open the cash drawer first (button on the POS home screen).",
  NO_RATE: "No exchange rate for that currency. A manager can set it in POS setup.",
  GIFT_CARD_NOT_FOUND: "Gift card not found or no longer active.",
  GIFT_CARD_BALANCE: "The gift card does not have enough balance.",
  SESSION_OPEN: "The cash drawer is already open.",
  SESSION_CLOSED: "That cash session is already closed.",
  SESSION_NOT_FOUND: "Cash session not found.",
  REASON_REQUIRED: "Write a short reason (3+ characters).",
  BAD_AMOUNT: "Enter a valid amount.",
  BAD_CURRENCY: "Use a 3-letter currency code, like USD.",
  BAD_CODE: "Gift card codes are 4-20 letters, numbers or dashes.",
  CODE_EXISTS: "That gift card code is already used.",
  NO_CUSTOMER: "Add the customer to the order before paying with points.",
  LOYALTY_OFF: "Points are not switched on for this outlet.",
  POINTS_BALANCE: "The customer does not have enough points.",
  NAME_REQUIRED: "Enter the customer's name.",
  BAD_PHONE: "Enter a valid phone number.",
  BAD_REFERRAL: "That referral code does not exist at this outlet.",
  NOT_DELIVERY: "This is not a delivery order.",
  NO_DRIVER: "Choose who is delivering first.",
  CREDIT_LIMIT: "That is over the customer's credit limit. A manager can approve it.",
  OVERPAID_CREDIT: "That is more than the customer owes.",
  BAD_RANGE: "Choose a date range of up to one year.",
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

