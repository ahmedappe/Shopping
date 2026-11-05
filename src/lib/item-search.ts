/**
 * Forgiving item search for staff screens: matches barcodes exactly, word starts
 * ("cof bea" → "Coffee beans"), letters in order ("cfbns") and small typos.
 * Returns the items sorted best first.
 */
export type SearchItem = { id: string; label: string; barcode?: string | null; sku?: string | null };

function norm(s: string) {
  return s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

/** Levenshtein distance, capped for speed. */
function distance(a: string, b: string, cap = 3) {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, cur[j]);
    }
    if (best > cap) return cap + 1;
    prev = cur;
  }
  return prev[b.length];
}

function isSubsequence(q: string, s: string) {
  let i = 0;
  for (const ch of s) if (ch === q[i]) i++;
  return i === q.length;
}

export function scoreItem(query: string, item: SearchItem): number {
  const q = norm(query);
  if (!q) return 0;
  const raw = query.trim();
  if (item.barcode && item.barcode === raw) return 1000;
  if (item.sku && item.sku.toLowerCase() === raw.toLowerCase()) return 900;

  const label = norm(item.label);
  if (label === q) return 800;
  if (label.startsWith(q)) return 700;

  const words = label.split(" ");
  const qWords = q.split(" ");
  let score = 0;
  let matched = 0;
  for (const qw of qWords) {
    let best = 0;
    for (const w of words) {
      if (w === qw) best = Math.max(best, 100);
      else if (w.startsWith(qw)) best = Math.max(best, 80);
      else if (w.includes(qw) && qw.length >= 3) best = Math.max(best, 50);
      else if (qw.length >= 4) {
        const d = distance(qw, w.slice(0, qw.length + 1));
        if (d <= 1) best = Math.max(best, 45);
        else if (d === 2 && qw.length >= 6) best = Math.max(best, 30);
      }
    }
    if (best > 0) matched++;
    score += best;
  }
  if (matched === qWords.length) return 200 + score;
  if (isSubsequence(q.replace(/ /g, ""), label.replace(/ /g, ""))) return 60;
  return matched > 0 ? score / 2 : 0;
}

export function searchItems<T extends SearchItem>(query: string, items: T[], limit = 30): T[] {
  if (!query.trim()) return [];
  return items
    .map((item) => ({ item, s: scoreItem(query, item) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.item.label.localeCompare(b.item.label))
    .slice(0, limit)
    .map((x) => x.item);
}
