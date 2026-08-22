import * as React from "react";

/**
 * The certificate, as the organizer's own design.
 *
 * Rebuilt from the Canva PDF rather than embedding it, because the PDF has the name
 * blank and the date printed into it — "13th June, 2026" — so using it as-is would hand
 * every winner a certificate dated to a different event. The artwork, paper texture and
 * both signatures are extracted from that file; everything that changes per person is
 * live text.
 *
 * Laid out in percentages inside a fixed A4-landscape ratio, so it is the same document
 * on a phone, on a projector and on paper. The old version was a gold-bordered panel
 * that looked nothing like the design the organizer had made.
 *
 * The verification code and its QR are on the back, at the organizer's request: the
 * front stays exactly as designed.
 */

/** A4 landscape, matching the source file at 842.25 x 595.5 pt. */
const RATIO = 842.25 / 595.5;

const INK = "#4A2E2A";
const GOLD = "#C79A5B";
/* The frame, sampled from the source file rather than guessed. */
const FRAME = "#4A2E2A";

export interface CertificateSheetProps {
  recipientName: string;
  /** The event's date, already formatted for print. */
  dateLabel: string;
  /** The verification code printed on the back. */
  code: string;
  /** The page anyone can open to check this certificate. */
  verifyUrl: string;
  /** A data URI for the QR. Absent while it is still being generated. */
  qrDataUri?: string;
  /**
   * A placement, when there is one — "1st place, Advanced division".
   *
   * Present turns the title into an achievement and states what was won; absent keeps
   * the participation wording the template was written with. A winner of PKR 5,000
   * should have that in writing.
   */
  placement?: string;
  /**
   * What this person did, in their own words on their own certificate.
   *
   * Everybody gets one — the point is that somebody who finished sixth receives a
   * document about them rather than a form letter. Always a fact from their results, so a
   * player who lost every game reads what they played and not invented praise.
   */
  personalNote?: string;
  /** Held-back certificates are marked, so a draft cannot be mistaken for an issued one. */
  draftNotice?: string;
}

export function CertificateSheet({
  recipientName,
  dateLabel,
  code,
  verifyUrl,
  qrDataUri,
  placement,
  personalNote,
  draftNotice,
}: CertificateSheetProps) {
  const isAward = Boolean(placement);

  return (
    <div className="certificate-sheet">
      {/* ---- Front: the organizer's design ------------------------------- */}
      <div
        className="certificate-page relative w-full overflow-hidden"
        style={{
          aspectRatio: String(RATIO),
          backgroundImage: "url(/certificate/paper.jpg)",
          backgroundSize: "100% 100%",
          color: INK,
          border: "0.26cqw solid " + FRAME,
          /*
           * Every size on this page is in `cqw`, so the whole certificate scales as one
           * document — identical proportions on a phone, a projector and A4 paper.
           * Without a container context those units fall back to zero and the sheet
           * renders blank.
           */
          containerType: "inline-size",
        }}
      >
        <p
          className="absolute inset-x-0 text-center font-semibold"
          style={{ top: "5.6%", fontSize: "2.1cqw", letterSpacing: "0.28em" }}
        >
          BLUFY&rsquo;S ALPHABATTLE X CHAI CHATT
        </p>

        {/*
          * The title carries the same weight and small "of" as the source. Fraunces is
          * the closest match to the file's serif and is already loaded by the app, so no
          * extra font is fetched for one line.
          */}
        <p
          className="font-display absolute inset-x-0 text-center font-black"
          style={{
            top: "10.4%",
            /*
             * Sized to fit on one line. At the source's apparent size this wrapped in
             * Fraunces, which is wider than the file's own serif, and the second line
             * collided with the recipient's name.
             */
            fontSize: "4.3cqw",
            letterSpacing: "0.02em",
            lineHeight: 1,
            whiteSpace: "nowrap",
          }}
        >
          CERTIFICATE{" "}
          <span style={{ fontSize: "3.0cqw", fontWeight: 600 }}>OF</span>{" "}
          {isAward ? "ACHIEVEMENT" : "PARTICIPATION"}
        </p>

        <Rule top="19.4%" />

        <p
          className="absolute inset-x-0 text-center"
          style={{ top: "22.4%", fontSize: "3.1cqw" }}
        >
          This certificate is proudly presented to
        </p>

        {/*
          * The name, which the template leaves blank. Sized down for long names rather
          * than wrapped into the rules above and below it — a two-line name would
          * collide with them.
          *
          * Set in capitals, which is how a name is engraved. Done here rather than stored
          * that way: the record keeps the name as the person wrote it, so the roster, the
          * desk and the board list still read "Abdul wasay Narinja" and only the certificate
          * shouts. Capitals are also wider, so the threshold for stepping the size down is
          * lower than it would be for mixed case.
          */}
        <p
          className="font-display absolute inset-x-0 truncate px-[9%] text-center font-bold"
          style={{
            top: "29.5%",
            fontSize: recipientName.length > 22 ? "4.4cqw" : "5.6cqw",
            lineHeight: 1.15,
            letterSpacing: "0.02em",
          }}
        >
          {recipientName.toUpperCase()}
        </p>

        <Rule top="39.4%" />

        {/*
          * Two lines, whichever wording applies.
          *
          * A placement pushed this to three lines and the third ran into the artwork.
          * The size steps down for the longer sentence instead, so the block occupies
          * the same space the template allotted it.
          *
          * The explicit {" "} matters: JSX dropped the space after the placement and it
          * printed "recreational divisionin Blufy's" on a real person's certificate.
          */}
        <p
          className="absolute inset-x-0 px-[13%] text-center italic"
          style={{
            top: "42.4%",
            fontSize: isAward ? "2.5cqw" : "2.9cqw",
            lineHeight: 1.45,
          }}
        >
          {isAward ? (
            <>
              for {placement}
              <br />
              at Blufy&rsquo;s Alphabattle&rsquo;s Speed Scrabble Competition, Chai Chatt.
            </>
          ) : (
            <>
              for participating in Blufy&rsquo;s Alphabattle&rsquo;s
              <br />
              Speed Scrabble Competition at Chai Chatt.
            </>
          )}
        </p>

        {/*
          * The personal line. Kept lighter and smaller than the sentence above it, so it
          * reads as a remark about this person rather than a second title.
          */}
        {personalNote ? (
          <p
            className="absolute inset-x-0 px-[15%] text-center"
            style={{ top: "48.4%", fontSize: "2.2cqw", lineHeight: 1.4, opacity: 0.82 }}
          >
            {personalNote}
          </p>
        ) : null}

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/certificate/artwork.png"
          alt=""
          className="absolute"
          /*
           * The band the template devotes to it — matched to the source, now that the
           * image is cropped to its visible content. Left as extracted it carried a
           * tall transparent margin, which printed the illustration across the date.
           */
          style={{ left: "20.5%", width: "59%", top: personalNote ? "54%" : "52.5%" }}
        />

        <p
          className="absolute inset-x-0 text-center font-bold"
          style={{ top: "74.5%", fontSize: "2.6cqw" }}
        >
          Dated:&nbsp; {dateLabel}
        </p>

        <Signature
          left="18%"
          image="/certificate/signature-hani.png"
          imageWidth="15cqw"
          name="Hani Garib"
          title="Founder - Blufy&rsquo;s Alphabattle"
        />
        <Signature
          left="55%"
          image="/certificate/signature-chai.png"
          imageWidth="8cqw"
          name="..."
          title="Chai Chatt"
        />

        {draftNotice ? (
          /*
            * Top corner, not the footer. Across the bottom it printed over the
            * signatures, which is the one part of a certificate that must stay clean.
            */
          <p
            className="absolute rounded-full font-semibold"
            style={{
              top: "2.4%",
              right: "2.4%",
              padding: "0.5cqw 1.4cqw",
              fontSize: "1.7cqw",
              color: "#8A5A18",
              background: "rgba(255,255,255,0.62)",
              border: "1px solid rgba(138,90,24,0.35)",
            }}
          >
            {draftNotice}
          </p>
        ) : null}
      </div>

      {/* ---- Back: how to check it -------------------------------------- */}
      <div
        className="certificate-page certificate-back relative w-full overflow-hidden"
        style={{
          aspectRatio: String(RATIO),
          backgroundImage: "url(/certificate/paper.jpg)",
          backgroundSize: "100% 100%",
          color: INK,
          border: "0.26cqw solid " + FRAME,
          /*
           * Every size on this page is in `cqw`, so the whole certificate scales as one
           * document — identical proportions on a phone, a projector and A4 paper.
           * Without a container context those units fall back to zero and the sheet
           * renders blank.
           */
          containerType: "inline-size",
        }}
      >
        <div className="absolute inset-0 flex flex-col items-center justify-center px-[12%] text-center">
          <p className="font-semibold" style={{ fontSize: "2.1cqw", letterSpacing: "0.28em" }}>
            VERIFY THIS CERTIFICATE
          </p>

          {qrDataUri ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={qrDataUri}
              alt={`QR code linking to ${verifyUrl}`}
              className="mt-[3%] rounded-[1.2cqw] bg-white"
              style={{ width: "22%", padding: "1.2cqw" }}
            />
          ) : null}

          <p
            className="font-mono mt-[2.5%] font-bold"
            style={{ fontSize: "3.4cqw", letterSpacing: "0.14em" }}
          >
            {code}
          </p>

          <p className="mt-[1.5%]" style={{ fontSize: "2.2cqw", opacity: 0.75 }}>
            {verifyUrl}
          </p>

          <p className="mt-[3%]" style={{ fontSize: "2.2cqw", lineHeight: 1.6, opacity: 0.8 }}>
            Scan the code or open the address above to confirm this certificate against the
            tournament&rsquo;s records. Anyone can check it — no account is needed.
          </p>
        </div>
      </div>
    </div>
  );
}

/** One of the thin gold rules that separate the template's sections. */
function Rule({ top }: { top: string }) {
  return (
    <span
      className="absolute"
      style={{
        top,
        left: "12%",
        right: "12%",
        height: "1px",
        /* Fades at both ends, as in the source file. */
        background: `linear-gradient(to right, transparent, ${GOLD}, transparent)`,
      }}
    />
  );
}

function Signature({
  left,
  image,
  imageWidth,
  name,
  title,
}: {
  left: string;
  image: string;
  imageWidth: string;
  name: string;
  title: string;
}) {
  return (
    <div className="absolute text-center" style={{ left, width: "27%", top: "79%" }}>
      {/* A fixed box, so both signatures sit on the same baseline whatever their size. */}
      <div className="flex h-[6cqw] items-end justify-center">
        {/*
          * Sized in `cqw`, against the page. As a percentage it resolved against this
          * 27%-wide block, so a 17% signature printed at under 5% of the page and read
          * as a smudge.
          */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={image} alt="" style={{ width: imageWidth }} />
      </div>
      <span
        className="mt-[3%] block"
        style={{ height: "1px", background: GOLD, opacity: 0.75 }}
      />
      <p className="mt-[3%] font-bold" style={{ fontSize: "2.3cqw" }}>
        {name}
      </p>
      <p style={{ fontSize: "1.9cqw", opacity: 0.8 }} dangerouslySetInnerHTML={{ __html: title }} />
    </div>
  );
}
