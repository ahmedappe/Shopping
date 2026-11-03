import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { STORE } from "@/config/store";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const priceFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: STORE.currency,
  minimumFractionDigits: 2,
});

export function formatPrice(value: number | string | null | undefined) {
  return priceFormatter.format(Number(value ?? 0));
}

export function formatDate(value: string | Date, withTime = false) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
    timeZone: STORE.timeZone,
  }).format(new Date(value));
}

export function slugify(input: string) {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** Only allow same-site relative redirects (prevents open-redirects). */
export function safeRedirectPath(path: string | null | undefined, fallback = "/") {
  if (!path || !path.startsWith("/") || path.startsWith("//") || path.startsWith("/\\")) return fallback;
  return path;
}

export function variantLabel(v: { option1: string | null; option2: string | null }) {
  return [v.option1, v.option2].filter(Boolean).join(" / ");
}

/** Strips characters that have meaning in PostgREST filter strings. */
export function sanitizeSearch(q: string) {
  return q.replace(/[%_,.()*:"'\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}

/** Maps database error codes raised in SQL functions to friendly messages. */
export function friendlyDbError(message: string | undefined) {
  if (!message) return "Something went wrong. Please try again.";
  if (message.startsWith("OUT_OF_STOCK:")) {
    return `Sorry, "${message.slice(13)}" doesn't have enough stock. Please update your cart.`;
  }
  const map: Record<string, string> = {
    NOT_AUTHENTICATED: "Please sign in to continue.",
    INVALID_CART: "Your cart is empty or invalid.",
    INVALID_QUANTITY: "One of the quantities in your cart is invalid.",
    ITEM_UNAVAILABLE: "An item in your cart is no longer available. Please update your cart.",
    TOO_MANY_PENDING_ORDERS: "You have 3 unpaid orders. Please upload a payment slip for them before placing another order.",
    ORDER_NOT_FOUND: "Order not found.",
    SLIP_NOT_ALLOWED: "A payment slip can no longer be uploaded for this order.",
    INVALID_PATH: "Upload failed. Please try again.",
    DUPLICATE_SLIP: "This receipt has already been used for another order.",
    INVALID_TRANSITION: "That status change isn't allowed for this order.",
    INVALID_LOCATION: "Collection place is too long.",
    INVALID_ROLE: "That role doesn't exist.",
    CANNOT_CHANGE_OWN_ROLE: "You can't change your own role. Ask another admin.",
    LAST_ADMIN: "You can't remove the last admin.",
    USER_NOT_FOUND: "User not found.",
    FORBIDDEN: "You don't have permission to do that.",
  };
  for (const key of Object.keys(map)) if (message.includes(key)) return map[key];
  return "Something went wrong. Please try again.";
}
