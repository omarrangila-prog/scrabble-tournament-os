"use client";

import * as React from "react";
import { CalendarDays, Check, CheckCircle2, Download, MapPin, Paintbrush, Paperclip, ShoppingBag, X } from "lucide-react";

import { ART_ACTIVITIES, ART_FEE, artLabel, artProblems, artTotal, type ArtActivity, type ArtEntry, type ArtField } from "@/lib/domain/art";
import { PROOF_ACCEPT } from "@/lib/domain/paymentProof";
import { ART_EVENT_ID, ART_SLUG, saveArtEntry } from "@/lib/supabase/art";
import { readPublicEvent } from "@/lib/supabase/events";
import { uploadPaymentProof } from "@/lib/supabase/paymentProof";
import { downloadArtReceipt, type ArtReceipt } from "@/lib/results/artReceiptPdf";
import { cn } from "@/lib/utils";

/**
 * Art Activity registration: Canvas Painting, Tote Bag Printing / Painting, or both.
 *
 * Built to be finished in half a minute on a phone opened from WhatsApp: one column, large tap
 * targets, the total worked out as the boxes are ticked. Nothing about Scrabble is asked here.
 */

const CREAM = "#F5F0E4";
const BROWN = "#3E2F23";
const FOREST = "#2F5D3A";
const GOLD = "#C89B3C";

const ICONS: Record<ArtActivity, React.ReactNode> = {
  canvas: <Paintbrush className="size-6" />,
  tote: <ShoppingBag className="size-6" />,
};

const money = (n: number) => `Rs. ${n.toLocaleString("en-PK")}`;

type Done = { receipt: ArtReceipt; activities: ArtActivity[]; payment: "online" | "cash" };

/** "12:00" -> "12:00 PM". */
function clock(hhmm: string): string {
  const m = hhmm.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return "";
  const h = Number(m[1]);
  return `${((h + 11) % 12) + 1}:${m[2]} ${h < 12 ? "AM" : "PM"}`;
}

/** A short reference to quote at the desk, unambiguous to read out (no 0/O or 1/I). */
function receiptNumber(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return "ART-" + Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

interface Place {
  when: string;
  venue: string;
  address: string;
  mapsUrl: string;
}

export default function ArtRegisterPage() {
  const [fee, setFee] = React.useState(ART_FEE);
  const [instructions, setInstructions] = React.useState("");
  const [place, setPlace] = React.useState<Place>({ when: "", venue: "", address: "", mapsUrl: "" });
  const [entry, setEntry] = React.useState<ArtEntry>({
    fullName: "",
    age: "",
    phone: "",
    email: "",
    activities: [],
    payment: null,
    proofFile: null,
  });
  const [file, setFile] = React.useState<File | null>(null);
  const [touched, setTouched] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<Done | null>(null);
  /* A double tap must not register twice; state is too slow to stop it. */
  const sending = React.useRef(false);

  React.useEffect(() => {
    let live = true;
    (async () => {
      const ev = await readPublicEvent(ART_SLUG);
      if (!live || !ev) return;
      const d = ev.details as unknown as Record<string, unknown>;
      const f = Number(d.activityFee);
      if (Number.isFinite(f) && f > 0) setFee(f);
      setInstructions(String(d.paymentInstructions ?? ""));
      const date = String(d.startDate ?? "");
      const day = date
        ? new Date(`${date}T12:00:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
        : "";
      const hours = [clock(String(d.startTime ?? "")), clock(String(d.endTime ?? ""))].filter(Boolean).join(" to ");
      setPlace({
        when: [day, hours].filter(Boolean).join(", "),
        venue: String(d.venueName ?? ""),
        address: String(d.venueAddress ?? ""),
        mapsUrl: String(d.mapsUrl ?? ""),
      });
    })();
    return () => {
      live = false;
    };
  }, []);

  const set = (patch: Partial<ArtEntry>) => setEntry((e) => ({ ...e, ...patch }));
  const toggle = (k: ArtActivity) =>
    set({ activities: entry.activities.includes(k) ? entry.activities.filter((a) => a !== k) : [...entry.activities, k] });

  const total = artTotal(entry.activities, fee);
  const problems = artProblems(entry);
  const problem = (f: ArtField) => (touched ? problems.find((p) => p.field === f)?.message : undefined);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    setError(null);
    if (problems.length > 0 || sending.current) return;
    sending.current = true;
    setBusy(true);
    try {
      let proof = null;
      if (entry.payment === "online" && file) {
        const up = await uploadPaymentProof({ eventId: ART_EVENT_ID, file });
        if (!up.ok) {
          setError(up.message);
          return;
        }
        proof = up.proof;
      }
      const receiptNo = receiptNumber();
      const saved = await saveArtEntry({
        receiptNo,
        fullName: entry.fullName.trim().replace(/\s+/g, " "),
        age: Number(entry.age),
        phone: entry.phone.trim(),
        email: entry.email.trim(),
        activities: ART_ACTIVITIES.map((a) => a.key).filter((k) => entry.activities.includes(k)),
        activityLabels: entry.activities.map(artLabel),
        payment: entry.payment,
        paymentStatus: entry.payment === "online" ? "receipt-uploaded" : "cash-at-venue",
        amountDue: total,
        currency: "PKR",
        ...(proof ? { paymentProof: proof } : {}),
      });
      if (!saved.ok) {
        setError(saved.message);
        return;
      }
      const chosen = ART_ACTIVITIES.map((x) => x.key).filter((k) => entry.activities.includes(k));
      setDone({
        activities: chosen,
        payment: entry.payment!,
        receipt: {
          receiptNo,
          fullName: entry.fullName.trim().replace(/\s+/g, " "),
          age: entry.age,
          phone: entry.phone.trim(),
          lines: chosen.map((k) => ({ label: artLabel(k), amount: fee })),
          total,
          paymentLine: entry.payment === "online" ? "Online, proof submitted" : "Pending, pay at the venue",
          when: place.when,
          where: [place.venue, place.address].filter(Boolean).join(", "),
          registeredAt: new Date().toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }),
        },
      });
      window.scrollTo({ top: 0 });
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };

  const input =
    "mt-1.5 w-full rounded-2xl border bg-white px-4 py-3.5 text-[17px] text-[#3E2F23] outline-none transition focus:border-[#2F5D3A] focus:ring-4 focus:ring-[#2F5D3A]/15";
  const label = "block text-[15px] font-semibold";
  const err = (m?: string) => (m ? <p className="mt-1.5 text-[13.5px] font-medium text-[#B3261E]">{m}</p> : null);

  if (done) {
    const r = done.receipt;
    const line = (k: string, v: React.ReactNode, strong = false) => (
      <div className="flex items-baseline justify-between gap-4 border-b pb-2.5 last:border-0 last:pb-0" style={{ borderColor: `${BROWN}14` }}>
        <span className="shrink-0 text-[12.5px] font-semibold uppercase tracking-wide" style={{ color: `${BROWN}99` }}>
          {k}
        </span>
        <span className={cn("min-w-0 text-right text-[15.5px]", strong ? "font-extrabold" : "font-semibold")}>{v}</span>
      </div>
    );
    return (
      <main className="min-h-dvh px-4 py-10" style={{ background: CREAM, color: BROWN }}>
        <div className="mx-auto w-full max-w-[480px] text-center">
          <span className="inline-grid size-16 place-items-center rounded-full" style={{ background: `${FOREST}1A`, color: FOREST }}>
            <CheckCircle2 className="size-8" />
          </span>
          <h1 className="mt-4 text-[24px] font-extrabold leading-tight">Thank you! Your registration has been received.</h1>
          <p className="mt-1 text-[14px]" style={{ color: `${BROWN}AA` }}>
            Save this receipt and show it at the desk.
          </p>

          <div className="mt-6 overflow-hidden rounded-3xl border bg-white text-left shadow-sm" style={{ borderColor: `${BROWN}1A` }}>
            <div className="px-5 py-4 text-center" style={{ background: FOREST, color: CREAM }}>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: "#E8D29A" }}>
                Registration receipt
              </p>
              <p className="mt-1 text-[22px] font-extrabold tracking-[0.06em]">{r.receiptNo}</p>
            </div>
            <div className="space-y-2.5 p-5">
              {line("Name", r.fullName)}
              {line("Age", r.age)}
              {line("Phone", r.phone)}
              {r.when ? line("When", r.when) : null}
              {r.where ? line("Where", place.mapsUrl ? <a href={place.mapsUrl} target="_blank" rel="noreferrer" className="underline decoration-dotted underline-offset-4">{r.where}</a> : r.where) : null}
              {r.lines.map((l) => line(l.label, money(l.amount)))}
              {line("Total", <span style={{ color: FOREST }}>{money(r.total)}</span>, true)}
              {line("Payment", done.payment === "online" ? "Submitted (proof uploaded)" : "Pending, pay at the venue")}
              {line("Registered", r.registeredAt)}
            </div>
          </div>

          <button
            type="button"
            onClick={() => void downloadArtReceipt(r)}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full py-4 text-[17px] font-extrabold text-white shadow-lg active:scale-[0.99]"
            style={{ background: FOREST }}
          >
            <Download className="size-5" />
            Download receipt
          </button>
          <p className="mt-3 text-[13px]" style={{ color: `${BROWN}99` }}>
            {done.payment === "online"
              ? "We have your payment proof. The organisers will contact you if anything is needed."
              : `Please bring ${money(r.total)} in cash and pay at the desk when you arrive.`}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-dvh px-4 pb-16 pt-8" style={{ background: CREAM, color: BROWN }}>
      <form onSubmit={submit} noValidate className="mx-auto w-full max-w-[480px] space-y-6">
        <header className="text-center">
          <p className="text-[12px] font-bold uppercase tracking-[0.2em]" style={{ color: GOLD }}>
            Reserve your spot
          </p>
          <h1 className="mt-1.5 text-[28px] font-extrabold leading-tight">Art Activity Registration</h1>
          <p className="mt-1 text-[15px]" style={{ color: `${BROWN}B3` }}>
            Choose your activity and reserve your spot.
          </p>
          {place.when || place.venue ? (
            <div className="mt-3 space-y-1 text-[14px] font-semibold">
              {place.when ? (
                <p className="flex items-center justify-center gap-1.5">
                  <CalendarDays className="size-4" style={{ color: GOLD }} />
                  {place.when}
                </p>
              ) : null}
              {place.venue ? (
                <p className="flex items-center justify-center gap-1.5">
                  <MapPin className="size-4 shrink-0" style={{ color: GOLD }} />
                  {place.mapsUrl ? (
                    <a href={place.mapsUrl} target="_blank" rel="noreferrer" className="underline decoration-dotted underline-offset-4">
                      {[place.venue, place.address].filter(Boolean).join(", ")}
                    </a>
                  ) : (
                    [place.venue, place.address].filter(Boolean).join(", ")
                  )}
                </p>
              ) : null}
            </div>
          ) : null}
        </header>

        {/* ---- Activities ---- */}
        <section>
          <p className="text-[17px] font-bold">Which activity would you like to join?</p>
          <p className="text-[14px]" style={{ color: `${BROWN}99` }}>
            Choose one or both.
          </p>
          <div className="mt-3 space-y-3">
            {ART_ACTIVITIES.map((a) => {
              const on = entry.activities.includes(a.key);
              return (
                <button
                  key={a.key}
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  onClick={() => toggle(a.key)}
                  className="flex w-full items-center gap-4 rounded-3xl border-2 bg-white px-4 py-4 text-left transition active:scale-[0.99]"
                  style={{ borderColor: on ? FOREST : `${BROWN}22`, background: on ? "#EEF4EC" : "#fff" }}
                >
                  <span
                    className="grid size-8 shrink-0 place-items-center rounded-lg border-2"
                    style={{ borderColor: on ? FOREST : `${BROWN}44`, background: on ? FOREST : "#fff", color: "#fff" }}
                  >
                    {on ? <Check className="size-5" strokeWidth={3} /> : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[17px] font-bold leading-snug">{a.label}</span>
                    <span className="block text-[16px] font-semibold" style={{ color: FOREST }}>
                      {money(fee)}
                    </span>
                  </span>
                  <span style={{ color: on ? FOREST : `${BROWN}66` }}>{ICONS[a.key]}</span>
                </button>
              );
            })}
          </div>
          {err(problem("activities"))}

          <div className="mt-3 rounded-3xl px-5 py-4" style={{ background: FOREST, color: CREAM }}>
            {entry.activities.length ? (
              <p className="text-[14px] opacity-90">
                Selected: {ART_ACTIVITIES.filter((a) => entry.activities.includes(a.key)).map((a) => a.label).join(" + ")}
              </p>
            ) : (
              <p className="text-[14px] opacity-90">1 activity = {money(fee)} · Both = {money(fee * 2)}</p>
            )}
            <p className="mt-0.5 text-[26px] font-extrabold tracking-tight">TOTAL: {money(total)}</p>
          </div>
        </section>

        {/* ---- Details ---- */}
        <section className="space-y-4">
          <label className={label}>
            Full name
            <input className={cn(input, problem("fullName") ? "border-[#B3261E]" : "border-[#3E2F2322]")} value={entry.fullName} onChange={(e) => set({ fullName: e.target.value })} autoComplete="name" placeholder="e.g. Sara Ali" />
            {err(problem("fullName"))}
          </label>
          <div className="grid grid-cols-[6.5rem_1fr] gap-3">
            <label className={label}>
              Age
              <input className={cn(input, problem("age") ? "border-[#B3261E]" : "border-[#3E2F2322]")} value={entry.age} onChange={(e) => set({ age: e.target.value.replace(/\D/g, "").slice(0, 2) })} inputMode="numeric" placeholder="12" />
            </label>
            <label className={label}>
              Phone number
              <input className={cn(input, problem("phone") ? "border-[#B3261E]" : "border-[#3E2F2322]")} value={entry.phone} onChange={(e) => set({ phone: e.target.value })} inputMode="tel" autoComplete="tel" placeholder="03xx xxxxxxx" />
            </label>
          </div>
          {err(problem("age"))}
          {err(problem("phone"))}
          <label className={label}>
            Email <span className="font-normal" style={{ color: `${BROWN}88` }}>(optional)</span>
            <input className={cn(input, problem("email") ? "border-[#B3261E]" : "border-[#3E2F2322]")} value={entry.email} onChange={(e) => set({ email: e.target.value })} inputMode="email" autoComplete="email" placeholder="you@example.com" />
            {err(problem("email"))}
          </label>
        </section>

        {/* ---- Payment ---- */}
        <section>
          <p className="text-[17px] font-bold">Payment method</p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            {(
              [
                ["online", "Online payment"],
                ["cash", "Cash / Pay at venue"],
              ] as const
            ).map(([k, l]) => {
              const on = entry.payment === k;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    set({ payment: k, ...(k === "cash" ? { proofFile: null } : {}) });
                    if (k === "cash") setFile(null);
                  }}
                  className="rounded-2xl border-2 bg-white px-3 py-4 text-[16px] font-bold transition active:scale-[0.99]"
                  style={{ borderColor: on ? FOREST : `${BROWN}22`, background: on ? "#EEF4EC" : "#fff", color: on ? FOREST : BROWN }}
                >
                  {l}
                </button>
              );
            })}
          </div>
          {err(problem("payment"))}

          {entry.payment === "online" ? (
            <div className="mt-3 space-y-3">
              {instructions ? (
                <p className="whitespace-pre-line rounded-2xl border bg-white/70 px-4 py-3 text-[14px] leading-relaxed" style={{ borderColor: `${BROWN}1A` }}>
                  {instructions}
                </p>
              ) : null}
              <label className="flex cursor-pointer items-center gap-3 rounded-2xl border-2 border-dashed bg-white px-4 py-4 text-[16px] font-semibold" style={{ borderColor: problem("proof") ? "#B3261E" : `${BROWN}33` }}>
                <Paperclip className="size-5 shrink-0" style={{ color: FOREST }} />
                <span className="min-w-0 flex-1 truncate">{file ? file.name : "Upload payment proof (JPG, PNG or PDF)"}</span>
                {file ? (
                  <span
                    role="button"
                    aria-label="Remove file"
                    onClick={(e) => {
                      e.preventDefault();
                      setFile(null);
                      set({ proofFile: null });
                    }}
                  >
                    <X className="size-5" />
                  </span>
                ) : null}
                <input
                  type="file"
                  accept={PROOF_ACCEPT}
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    setFile(f);
                    set({ proofFile: f ? { name: f.name, type: f.type, size: f.size } : null });
                    e.target.value = "";
                  }}
                />
              </label>
              {err(problem("proof"))}
            </div>
          ) : null}
        </section>

        {error ? <p className="rounded-2xl bg-[#FDECEA] px-4 py-3 text-[14.5px] font-medium text-[#B3261E]">{error}</p> : null}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-full py-4 text-[18px] font-extrabold tracking-wide text-white shadow-lg transition active:scale-[0.99] disabled:opacity-60"
          style={{ background: FOREST }}
        >
          {busy ? "Registering…" : `REGISTER NOW${total ? ` · ${money(total)}` : ""}`}
        </button>
      </form>
    </main>
  );
}
