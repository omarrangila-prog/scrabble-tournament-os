"use client";

/**
 * The certificate, on the page and on paper.
 *
 * Rendered rather than drawn as an image, so it prints at the printer's resolution, reads on
 * a phone, and the name is real text a person can select and a screen reader can say.
 *
 * Printing takes the whole page — the round-by-round table and then the certificate — because
 * the certificate's only claim is the record above it, and a person saving this wants the
 * evidence in the same file as the statement.
 */
export function Certificate({
  name,
  citation,
  division,
  position,
}: {
  name: string;
  citation: string;
  division: string;
  /** "1st of 33", or null for a player the standings do not rank. */
  position: string | null;
}) {
  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          html, body { background: #FFFDF7 !important; color: #14261C !important; }
          main { background: none !important; color: #14261C !important; padding: 0 !important; }
          main * { color: #14261C !important; }
          .certificate {
            break-before: page;
            background: #FFFDF7 !important;
            border-color: #C89B3C !important;
          }
          .certificate .accent, .accent { color: #8A6A1E !important; }
          .certificate .rule { background: #C89B3C !important; }
          .muted { color: #5B6B60 !important; }
          @page { margin: 14mm; }
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

        <p className="muted mx-auto mt-5 max-w-xl text-sm leading-relaxed text-white/70 sm:text-base">
          {citation}
        </p>

        {position ? (
          <p className="accent mt-6 text-lg font-extrabold uppercase tracking-[0.12em] text-[#C89B3C]">
            Final position: {position}
          </p>
        ) : null}

        <div className="rule mx-auto mt-8 h-px w-16" style={{ background: "#C89B3C" }} />
        <figcaption className="muted mt-4 text-xs text-white/40">
          Issued from the official tournament record.
        </figcaption>
      </figure>

      <button
        type="button"
        onClick={() => window.print()}
        className="no-print mt-4 w-full rounded-lg px-4 py-3 text-sm font-bold transition hover:opacity-90 sm:w-auto"
        style={{ background: "#C89B3C", color: "#0E1512" }}
      >
        Download this page &mdash; results and certificate
      </button>
    </>
  );
}
