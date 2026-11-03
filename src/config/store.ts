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

/**
 * Bank details to show for an outlet. If the outlet has no account saved yet, falls back
 * to the single account in the BANK_* settings (how the store worked before outlets).
 */
export function bankDetailsFor(
  outlet?: { bank_name: string | null; account_name: string | null; account_number: string | null } | null,
) {
  if (outlet?.account_number) {
    return {
      bankName: outlet.bank_name ?? "",
      accountName: outlet.account_name ?? "",
      accountNumber: outlet.account_number,
    };
  }
  return getBankDetails();
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
