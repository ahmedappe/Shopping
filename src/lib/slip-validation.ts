/**
 * Basic, best-effort checks on the text read (OCR) from a bank-transfer receipt.
 *
 * This is a first filter only: OCR can misread, and a screenshot can be edited.
 * It weeds out photos that aren't receipts and flags obvious mismatches so the
 * admin knows where to look. The admin still verifies every payment.
 *
 * Pure functions, no I/O — safe to run in the browser and on the server.
 */

export type SlipExpectation = {
  /** Order total the customer should have paid. */
  amount: number;
  /** Our account number (digits only are compared). */
  accountNumber: string;
  /** Our account name, e.g. "Red Wave Pvt Ltd". */
  accountName: string;
  /** When the order was placed (ISO). A slip dated before this is suspicious. */
  orderCreatedAt: string;
};

export type SlipChecks = {
  /** Enough receipt-like content to be a bank receipt at all. */
  looksLikeReceipt: boolean;
  bankRecognised: boolean;
  statusSuccess: boolean;
  /** true = matches, false = a different amount was found, null = no amount read. */
  amountMatches: boolean | null;
  /** true = our account number / name found, false = not found. */
  accountMatches: boolean;
  /** true = plausible, false = future or before the order, null = no date read. */
  dateOk: boolean | null;
  referenceFound: boolean;
};

export type SlipResult = {
  bank: "BML" | "MIB" | null;
  reference: string | null;
  amount: number | null;
  paidAt: string | null; // ISO
  checks: SlipChecks;
  /** Human-readable problems, shown to the customer and the admin. */
  warnings: string[];
  /** Never blocks the upload: "review" means the admin should look closely. */
  verdict: "ok" | "review";
};

const MV_OFFSET = "+05:00"; // Maldives time; receipts print local time

function digitsOnly(s: string) {
  return s.replace(/\D/g, "");
}

/** True if `needle` appears in `haystack` allowing at most one wrong digit (OCR slips). */
function fuzzyContains(haystack: string, needle: string): boolean {
  if (needle.length < 6) return false;
  if (haystack.includes(needle)) return true;
  for (let i = 0; i + needle.length <= haystack.length; i++) {
    let miss = 0;
    for (let j = 0; j < needle.length && miss <= 1; j++) {
      if (haystack[i + j] !== needle[j]) miss++;
    }
    if (miss <= 1) return true;
  }
  return false;
}

function normaliseName(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function extractAmounts(text: string): number[] {
  const out: number[] = [];
  const re = /(?<![\d.,])(\d{1,3}(?:,\d{3})+|\d+)\.(\d{2})(?!\d)/g;
  for (const m of text.matchAll(re)) {
    out.push(Number(m[1].replace(/,/g, "") + "." + m[2]));
  }
  return out;
}

export function extractDate(text: string): Date | null {
  // 2026-11-02 22:16:58  (Maldives Islamic Bank)
  let m = text.match(/(\d{4})-(\d{2})-(\d{2})[ T]+(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (m) {
    const d = new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] ?? "00"}${MV_OFFSET}`);
    if (!Number.isNaN(d.getTime())) return d;
  }
  // 01/11/2026 20:13  (Bank of Maldives, day first)
  m = text.match(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (m) {
    const iso = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}T${m[4].padStart(2, "0")}:${m[5]}:${m[6] ?? "00"}${MV_OFFSET}`;
    const d = new Date(iso);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

function extractReference(text: string): string | null {
  // BML: "Reference  BLAZ1IV71SM3R4QWI"
  let m = text.match(/Reference\s*[:#]?\s*([A-Z0-9]{10,24})\b/i);
  if (m) return m[1].toUpperCase();
  // MIB: "Transaction#  819241374"
  m = text.match(/Transaction\s*(?:#|no\.?|number|id)\s*[:#]?\s*([A-Z0-9]{6,24})\b/i);
  if (m) return m[1].toUpperCase();
  return null;
}

export function evaluateSlipText(rawText: string, expected: SlipExpectation, now = new Date()): SlipResult {
  const text = rawText.replace(/\r/g, "");
  const lower = text.toLowerCase();
  const flat = lower.replace(/\s+/g, " ");

  const bank: SlipResult["bank"] = /maldives islamic bank|\bmib\b/.test(flat)
    ? "MIB"
    : /bank of maldives|\bbml\b/.test(flat)
      ? "BML"
      : null;

  const reference = extractReference(text);
  const amounts = extractAmounts(text);
  const paidDate = extractDate(text);

  // --- receipt-likeness: count independent signals ---
  const hasKeyword = /transaction|transfer|reference|remarks|processed|payment|amount/.test(flat);
  const hasMvr = /\bmvr\b|\brf\b/.test(flat);
  const signals =
    (bank ? 1 : 0) + (hasKeyword ? 1 : 0) + (hasMvr ? 1 : 0) + (amounts.length ? 1 : 0) + (paidDate ? 1 : 0) + (reference ? 1 : 0);
  const looksLikeReceipt = text.trim().length >= 40 && signals >= 3;

  const statusSuccess = /\b(success|successful|completed)\b/.test(flat);
  const failedWord = /\b(failed|declined|rejected|cancelled|canceled|unsuccessful)\b/.test(flat);

  // --- amount ---
  let amountMatches: boolean | null = null;
  let amount: number | null = null;
  if (amounts.length) {
    const hit = amounts.find((a) => Math.abs(a - expected.amount) < 0.005);
    amountMatches = hit !== undefined;
    amount = hit ?? amounts.reduce((a, b) => (b > a ? b : a), 0);
  }

  // --- account ---
  const digits = digitsOnly(text);
  const wantDigits = digitsOnly(expected.accountNumber);
  const numberFound = wantDigits.length >= 6 && fuzzyContains(digits, wantDigits);
  const wantName = normaliseName(expected.accountName);
  const nameFound = wantName.length >= 4 && normaliseName(text).includes(wantName.slice(0, Math.min(wantName.length, 12)));
  // If our bank details aren't configured there's nothing to compare against.
  const accountConfigured = wantDigits.length >= 6 || wantName.length >= 4;
  const accountMatches = !accountConfigured || numberFound || nameFound;

  // --- date ---
  let dateOk: boolean | null = null;
  if (paidDate) {
    const created = new Date(expected.orderCreatedAt).getTime();
    const tooEarly = paidDate.getTime() < created - 10 * 60_000;
    const inFuture = paidDate.getTime() > now.getTime() + 15 * 60_000;
    dateOk = !tooEarly && !inFuture;
  }

  const checks: SlipChecks = {
    looksLikeReceipt,
    bankRecognised: bank !== null,
    statusSuccess: statusSuccess && !failedWord,
    amountMatches,
    accountMatches,
    dateOk,
    referenceFound: reference !== null,
  };

  const warnings: string[] = [];
  if (!looksLikeReceipt) {
    warnings.push("This doesn't look like a bank transfer receipt. If it's the wrong image, please upload the confirmation screen from your banking app.");
  } else {
    if (failedWord) warnings.push("The receipt appears to show an unsuccessful transfer.");
    if (amountMatches === false) warnings.push(`We couldn't find the order total (${expected.amount.toFixed(2)}) on this receipt.`);
    if (amountMatches === null) warnings.push("We couldn't read an amount from this receipt.");
    if (!accountMatches) warnings.push("We couldn't find our account number or name on this receipt.");
    if (dateOk === false) warnings.push("The receipt date looks wrong (before the order was placed, or in the future).");
    if (dateOk === null) warnings.push("We couldn't read a date from this receipt.");
    if (!reference) warnings.push("We couldn't read a transaction reference.");
  }

  const verdict: SlipResult["verdict"] = warnings.length ? "review" : "ok";

  return {
    bank,
    reference,
    amount,
    paidAt: paidDate ? paidDate.toISOString() : null,
    checks,
    warnings,
    verdict,
  };
}
