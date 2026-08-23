"use client";

/**
 * The certificate itself, on the page and on paper.
 *
 * Rendered rather than generated as an image so it prints at the printer's resolution and
 * reads on a phone, and so the name is real text — a participant can select it, and a
 * screen reader can say it.
 *
 * The print rule hides the rest of the page and puts this alone on one landscape sheet.
 */
export function Certificate({
  name,
  title,
  citation,
  division,
}: {
  name: string;
  title: string;
  citation: string;
  division: string;
}) {
  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .certificate, .certificate * { visibility: visible; }
          .certificate {
            position: absolute; inset: 0; margin: 0;
            width: 100%; border-radius: 0; box-shadow: none;
            background: #FFFDF7 !important; color: #14261C !important;
          }
          .certificate .rule { background: #C89B3C !important; }
          .certificate .muted { color: #5B6B60 !important; }
          .certificate .accent { color: #8A6A1E !important; }
          .no-print { display: none !important; }
          @page { size: A4 landscape; margin: 12mm; }
        }
      `}</style>

      <figure
        className="certificate mt-4 overflow-hidden rounded-2xl border px-6 py-10 text-center sm:px-12 sm:py-14"
        style={{
          borderColor: "rgba(200,155,60,0.45)",
          background: "linear-gradient(160deg, #16241C 0%, #101A15 100%)",
        }}
      >
        <p className="accent text-[0.7rem] font-bold uppercase tracking-[0.3em] text-[#C89B3C]">
          Blufy&rsquo;s AlphaBattle
        </p>
        <p className="muted mt-1 text-xs uppercase tracking-[0.18em] text-white/45">
          {division} Division · 23 August 2026 · Karachi
        </p>

        <div className="rule mx-auto mt-6 h-px w-16" style={{ background: "#C89B3C" }} />

        <p className="muted mt-6 text-sm uppercase tracking-[0.2em] text-white/50">
          This certifies that
        </p>
        <p className="mt-3 text-3xl font-extrabold tracking-tight sm:text-5xl">{name}</p>

        <p className="accent mt-6 text-lg font-extrabold uppercase tracking-[0.12em] text-[#C89B3C] sm:text-2xl">
          {title}
        </p>

        <p className="muted mx-auto mt-4 max-w-xl text-sm leading-relaxed text-white/65 sm:text-base">
          {citation}
        </p>

        <div className="rule mx-auto mt-8 h-px w-16" style={{ background: "#C89B3C" }} />
        <figcaption className="muted mt-4 text-xs text-white/40">
          Issued from the official tournament record.
        </figcaption>
      </figure>

      <button
        type="button"
        onClick={() => window.print()}
        className="no-print mt-4 rounded-lg px-4 py-2 text-sm font-bold transition hover:opacity-90"
        style={{ background: "#C89B3C", color: "#0E1512" }}
      >
        Print or save as PDF
      </button>
    </>
  );
}
