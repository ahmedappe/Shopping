export const STORE = {
  name: "Kandhufathi",
  currency: process.env.NEXT_PUBLIC_CURRENCY || "MVR",
  timeZone: "Indian/Maldives",
  description: "Quality products, delivered to your door.",
  pageSize: 12,
  lowStockThreshold: 5,
} as const;

/** Server-only: read inside server components / actions. */
export function getBankDetails() {
  return {
    bankName: process.env.BANK_NAME ?? "",
    accountName: process.env.BANK_ACCOUNT_NAME ?? "",
    accountNumber: process.env.BANK_ACCOUNT_NUMBER ?? "",
  };
}

/** Places a customer can collect an order from. Edit this list to add more. */
export const COLLECTION_POINTS = ["Shop", "Godown"] as const;

export const ORDER_STATUS_META = {
  pending: { label: "Pending payment", tone: "amber" },
  slip_uploaded: { label: "Slip uploaded", tone: "blue" },
  approved: { label: "Approved", tone: "green" },
  delivered: { label: "Delivered", tone: "emerald" },
  rejected: { label: "Rejected", tone: "red" },
} as const;
