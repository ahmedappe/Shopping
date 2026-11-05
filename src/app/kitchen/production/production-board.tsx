"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Mic, MicOff } from "lucide-react";
import { recordProduction } from "./actions";
import { parseTranscript } from "./voice";

export type ProductionRow = { variantId: string; label: string; ready: number; reorder: number | null };

type Kind = "made" | "undo_made" | "wasted" | "set";
type Pending = { variantId: string; label: string; qty: number; text: string }[];

// Minimal typing for the browser speech API (not in lib.dom for all targets).
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
};

export function ProductionBoard({ outletId, rows }: { outletId: string; rows: ProductionRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [custom, setCustom] = useState<Record<string, string>>({});
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [heard, setHeard] = useState<Pending | null>(null);
  const [unmatched, setUnmatched] = useState<string[]>([]);
  const rec = useRef<Recognition | null>(null);

  const speechSupported =
    typeof window !== "undefined" && Boolean((window as unknown as Record<string, unknown>).SpeechRecognition || (window as unknown as Record<string, unknown>).webkitSpeechRecognition);

  function save(entries: { variantId: string; qty: number; kind: Kind; label?: string }[], after?: () => void) {
    setError(null);
    start(async () => {
      const res = await recordProduction(outletId, entries);
      if (!res.ok) setError(res.error);
      else {
        after?.();
        router.refresh();
      }
    });
  }

  function interpret(text: string) {
    const items = rows.map((r) => ({ id: r.variantId, label: r.label }));
    const parsed = parseTranscript(text, items);
    setHeard(parsed.filter((p) => p.item).map((p) => ({ variantId: p.item!.id, label: p.item!.label, qty: p.qty, text: p.text })));
    setUnmatched(parsed.filter((p) => !p.item).map((p) => p.text));
    if (parsed.length === 0) setUnmatched([text]);
  }

  function toggleListen() {
    if (listening) {
      rec.current?.stop();
      return;
    }
    const w = window as unknown as Record<string, new () => Recognition>;
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return;
    const r = new Ctor();
    r.lang = "en-US";
    r.continuous = false;
    r.interimResults = false;
    r.onresult = (e) => {
      const text = Array.from(e.results).map((x) => x[0].transcript).join(" ");
      setTranscript(text);
      interpret(text);
    };
    r.onend = () => setListening(false);
    r.onerror = () => {
      setListening(false);
      setError("Could not hear that. Check the microphone permission, or type it below.");
    };
    rec.current = r;
    setListening(true);
    r.start();
  }

  return (
    <div className="mt-4 space-y-4">
      <section className="rounded-xl border border-zinc-700 bg-zinc-900 p-3">
        <p className="text-sm text-zinc-300">Say or type what was made, e.g. “chicken curry 9 and egg roll 12”.</p>
        <div className="mt-2 flex gap-2">
          {speechSupported && (
            <button type="button" onClick={toggleListen} className={`inline-flex items-center gap-2 rounded-lg px-4 py-3 font-semibold ${listening ? "bg-red-600" : "bg-white text-black"}`}>
              {listening ? <MicOff className="size-5" /> : <Mic className="size-5" />} {listening ? "Stop" : "Speak"}
            </button>
          )}
          <input
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && interpret(transcript)}
            placeholder="chicken curry 9 and egg roll 12"
            className="min-w-0 flex-1 rounded-lg border border-zinc-600 bg-zinc-950 px-3 py-3"
          />
          <button type="button" onClick={() => interpret(transcript)} className="rounded-lg border border-zinc-600 px-4 hover:bg-zinc-800">Check</button>
        </div>
        {unmatched.length > 0 && <p className="mt-2 text-sm text-amber-400">Could not match: {unmatched.join("; ")}</p>}
        {heard && heard.length > 0 && (
          <div className="mt-3 rounded-lg bg-zinc-800 p-3">
            <p className="text-sm font-semibold">Add these to ready stock?</p>
            <ul className="mt-1 space-y-1">
              {heard.map((h, i) => (
                <li key={i} className="flex items-center justify-between gap-2">
                  <span>{h.label}</span>
                  <span className="flex items-center gap-2">
                    <input
                      className="w-16 rounded border border-zinc-600 bg-zinc-950 px-2 py-1 text-right"
                      inputMode="numeric"
                      value={h.qty}
                      onChange={(e) => setHeard((cur) => cur && cur.map((x, j) => (j === i ? { ...x, qty: Number(e.target.value.replace(/\D/g, "")) || 0 } : x)))}
                    />
                    <button type="button" className="text-zinc-400 hover:text-white" onClick={() => setHeard((cur) => cur && cur.filter((_, j) => j !== i))}>✕</button>
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  save(heard.filter((h) => h.qty > 0).map((h) => ({ variantId: h.variantId, qty: h.qty, kind: "made" as const, label: h.label })), () => {
                    setHeard(null);
                    setTranscript("");
                    setUnmatched([]);
                  })
                }
                className="rounded-lg bg-emerald-500 px-4 py-2 font-semibold text-black disabled:opacity-50"
              >
                Confirm
              </button>
              <button type="button" onClick={() => setHeard(null)} className="rounded-lg border border-zinc-600 px-4 py-2">Cancel</button>
            </div>
          </div>
        )}
      </section>

      {error && <p className="rounded-lg bg-red-900/60 p-3 text-sm" role="alert">{error}</p>}

      {rows.length === 0 ? (
        <p className="text-zinc-400">No items are set as “made in advance” for this station. Turn it on per item in POS setup.</p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {rows.map((r) => {
            const low = r.reorder !== null && r.ready <= r.reorder;
            return (
              <li key={r.variantId} className={`rounded-xl border p-3 ${low ? "border-amber-500 bg-amber-950/30" : "border-zinc-700 bg-zinc-900"}`}>
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold">{r.label}</p>
                  <p className="text-3xl font-bold tabular-nums">{r.ready}</p>
                </div>
                {low && (
                  <p className="mt-1 flex items-center gap-1 text-sm text-amber-400">
                    <AlertTriangle className="size-4" /> Make more (at {r.reorder} or below)
                  </p>
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                  {[1, 5, 10].map((n) => (
                    <button key={n} type="button" disabled={pending} onClick={() => save([{ variantId: r.variantId, qty: n, kind: "made", label: r.label }])} className="rounded-lg bg-white px-3 py-2 font-semibold text-black disabled:opacity-50">
                      +{n}
                    </button>
                  ))}
                  <input
                    className="w-16 rounded-lg border border-zinc-600 bg-zinc-950 px-2 text-center"
                    inputMode="numeric"
                    placeholder="qty"
                    value={custom[r.variantId] ?? ""}
                    onChange={(e) => setCustom((c) => ({ ...c, [r.variantId]: e.target.value.replace(/\D/g, "") }))}
                  />
                </div>
                <div className="mt-2 flex flex-wrap gap-2 text-sm">
                  {(
                    [
                      ["made", "Made"],
                      ["wasted", "Wasted"],
                      ["set", "Set count"],
                      ["undo_made", "Undo made"],
                    ] as const
                  ).map(([kind, text]) => (
                    <button
                      key={kind}
                      type="button"
                      disabled={pending || !custom[r.variantId]}
                      onClick={() => save([{ variantId: r.variantId, qty: Number(custom[r.variantId]), kind, label: r.label }], () => setCustom((c) => ({ ...c, [r.variantId]: "" })))}
                      className="rounded-lg border border-zinc-600 px-3 py-1.5 hover:bg-zinc-800 disabled:opacity-40"
                    >
                      {text}
                    </button>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-xs text-zinc-500">Type a number in the box, then pick Made / Wasted / Set count / Undo made. “Made” uses up ingredients from the recipe.</p>
    </div>
  );
}
