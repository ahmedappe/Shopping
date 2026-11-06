import { searchItems, type SearchItem } from "@/lib/item-search";

const WORDS: Record<string, number> = {
  zero: 0, one: 1, two: 2, to: 2, too: 2, three: 3, four: 4, for: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100, a: 1, an: 1,
};

/** "twenty five" → 25, "9" → 9. Returns null if the words are not a number. */
export function wordsToNumber(words: string[]): number | null {
  let total = 0;
  let any = false;
  for (const w of words) {
    if (/^\d+$/.test(w)) { total += Number(w); any = true; continue; }
    const n = WORDS[w];
    if (n === undefined) return null;
    any = true;
    if (n === 100) total = (total || 1) * 100;
    else total += n;
  }
  return any ? total : null;
}

export type Heard = { text: string; qty: number; item: (SearchItem & { id: string }) | null };

/**
 * Turns "chicken curry 9 and egg roll twelve, fish cutlet 6" into entries.
 * The number can come before or after the name ("9 chicken curry").
 */
export function parseTranscript<T extends SearchItem>(transcript: string, items: T[]): (Omit<Heard, "item"> & { item: T | null })[] {
  const parts = transcript
    .toLowerCase()
    .replace(/[.]/g, " ")
    .split(/\s*(?:,|\band\b|\bthen\b|\balso\b|\bplus\b)\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
  const out: (Omit<Heard, "item"> & { item: T | null })[] = [];
  for (const part of parts) {
    const words = part.split(/\s+/);
    let qty: number | null = null;
    let name = words;
    // number at the end
    for (let k = Math.min(3, words.length - 1); k >= 1 && qty === null; k--) {
      const n = wordsToNumber(words.slice(words.length - k));
      if (n !== null) { qty = n; name = words.slice(0, words.length - k); }
    }
    // number at the start
    for (let k = Math.min(3, words.length - 1); k >= 1 && qty === null; k--) {
      const n = wordsToNumber(words.slice(0, k));
      if (n !== null) { qty = n; name = words.slice(k); }
    }
    if (qty === null || name.length === 0) continue;
    const found = searchItems(name.join(" "), items, 1)[0] ?? null;
    out.push({ text: part, qty, item: found });
  }
  return out;
}
