"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import { BadgeCheck, CircleHelp, Search, ShieldOff } from "lucide-react";
import { Button, Card, Field, Input } from "@/components/ui";
import { verifyCertificate, type VerifiedCertificate } from "@/lib/supabase/certificates";
import {
  CERTIFICATE_KIND_LABEL,
  normaliseCode,
  VerificationOutcome,
} from "@/lib/engine/certificates";
import { cn, formatDate } from "@/lib/utils";

const OUTCOME: Record<
  VerificationOutcome,
  { tone: string; ring: string; icon: React.ReactNode; heading: string }
> = {
  valid: {
    tone: "text-[#12855c]",
    ring: "border-success bg-success-050",
    icon: <BadgeCheck className="size-7" />,
    heading: "Verified",
  },
  revoked: {
    tone: "text-critical",
    ring: "border-critical bg-critical-050",
    icon: <ShieldOff className="size-7" />,
    heading: "Withdrawn",
  },
  "not-issued": {
    tone: "text-[#a76d16]",
    ring: "border-warning bg-warning-050",
    icon: <CircleHelp className="size-7" />,
    heading: "Not issued",
  },
  unknown: {
    tone: "text-muted",
    ring: "border-line bg-[rgb(var(--c-surface-soft))]",
    icon: <CircleHelp className="size-7" />,
    heading: "Not found",
  },
};

/**
 * Public certificate verification.
 *
 * Reachable by anyone holding a certificate, with no account. It answers one
 * question — is this real — and shows only what is printed on the paper
 * anyway. No internal ids, no contact details, no list of other certificates.
 */
export default function VerifyPage() {
  const params = useParams<{ code?: string[] }>();
  /*
   * Certificate QR codes point at /verify/certificate/{code}, which its own
   * route handles. Next.js prefers that static segment over this catch-all, but
   * if it ever fell through, code[0] would be the literal "certificate" and the
   * scan would read as an unknown code. Take the last segment instead.
   */
  const segments = params.code ?? [];
  const last = segments[segments.length - 1];
  const fromUrl = last && last !== "certificate" ? decodeURIComponent(last) : "";

  const [input, setInput] = React.useState(fromUrl);
  const [submitted, setSubmitted] = React.useState(fromUrl);

  /*
   * The lookup goes to the database.
   *
   * It used to read the certificate store, which lives in browser storage — so this page
   * could only confirm certificates issued in the very browser it was opened in. Everybody
   * scanning the QR on their own certificate was told the code was unknown, which is worse
   * than having no verification at all: it says the document is fake.
   */
  const [certificate, setCertificate] = React.useState<VerifiedCertificate | null>(null);
  const [looking, setLooking] = React.useState(Boolean(fromUrl.trim()));

  /*
   * Tracks which code the current result belongs to. Comparing it against `submitted`
   * during render is how the page knows a fresh lookup is outstanding, instead of
   * setting a flag from an effect.
   */
  const [answeredFor, setAnsweredFor] = React.useState(fromUrl);
  if (answeredFor !== submitted) {
    setAnsweredFor(submitted);
    setLooking(Boolean(submitted.trim()));
  }

  React.useEffect(() => {
    const code = submitted.trim();
    let live = true;

    /*
     * Every write happens in the async continuation. Setting state synchronously from an
     * effect is refused by the React Compiler, and the empty-code case is derived below
     * rather than stored, which removes the need to.
     */
    (async () => {
      const found = code ? await verifyCertificate(code) : null;
      if (!live) return;
      setCertificate(found);
      setLooking(false);
    })();

    return () => {
      live = false;
    };
  }, [submitted]);

  /*
   * Three answers, and they are deliberately different. "Withdrawn" is not "unknown": one
   * says this certificate was real and has been voided, the other says nothing matches.
   */
  const outcome = !submitted.trim()
    ? null
    : looking
      ? null
      : !certificate
        ? "unknown"
        : certificate.status === "revoked"
          ? "revoked"
          : "valid";

  const result = outcome ? { outcome } : null;
  const event = certificate
    ? { name: certificate.eventName, startDate: certificate.eventDate ?? "" }
    : undefined;

  const style = outcome ? OUTCOME[outcome as keyof typeof OUTCOME] : null;

  return (
    <main className="board-motif min-h-dvh px-4 py-12">
      <div className="mx-auto w-full max-w-[560px]">
        <div className="text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-muted">
            Blufy&rsquo;s AlphaBattle
          </p>
          <h1 className="mt-1.5 text-[26px] font-extrabold tracking-[-0.02em] text-ink">
            Verify a certificate
          </h1>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">
            Enter the code printed on the certificate, or scan its QR code.
          </p>
        </div>

        <Card className="mt-6">
          <div className="space-y-3 p-5">
            <Field label="Verification code">
              <Input
                autoFocus
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && setSubmitted(input)}
                placeholder="ABCD-EFGH-JKMN"
                className="num text-center text-[16px] tracking-[0.14em] uppercase"
              />
            </Field>
            <Button
              variant="primary"
              size="lg"
              className="w-full"
              icon={<Search className="size-4" />}
              onClick={() => setSubmitted(input)}
            >
              Verify
            </Button>
            {input.trim() && normaliseCode(input) !== input.toUpperCase() ? (
              <p className="text-center text-[11.5px] text-faint">
                Reading as {normaliseCode(input)}
              </p>
            ) : null}
          </div>
        </Card>

        {result && style ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
          >
            <Card className={cn("mt-4 border-2", style.ring)}>
              <div className="p-6 text-center">
                <span className={cn("inline-flex", style.tone)}>{style.icon}</span>
                <p className={cn("mt-2 text-[19px] font-extrabold", style.tone)}>{style.heading}</p>
                {/*
                  * The sentence belongs to the outcome, not to a store record. Withdrawn
                  * certificates say why, because "this is void" without a reason leaves
                  * whoever is holding it with nothing to act on.
                  */}
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink">
                  {outcome === "valid"
                    ? "This certificate is genuine and stands on the tournament's records."
                    : outcome === "revoked"
                      ? certificate?.revokedReason
                        ? `This certificate has been withdrawn: ${certificate.revokedReason}`
                        : "This certificate has been withdrawn."
                      : "No certificate matches that code. Check the characters, or ask the organizer."}
                </p>

                {certificate && result.outcome !== "unknown" ? (
                  <dl className="mt-5 space-y-2.5 text-left">
                    {[
                      ["Recipient", certificate.recipientName],
                      ["Achievement", certificate.statement],
                      ["Type", CERTIFICATE_KIND_LABEL[certificate.kind as keyof typeof CERTIFICATE_KIND_LABEL] ?? certificate.kind],
                      certificate.division ? ["Division", certificate.division] : null,
                      certificate.detail ? ["Detail", certificate.detail] : null,
                      event ? ["Event", event.name] : null,
                      /*
                       * The date of the event, next to its name.
                       *
                       * "Issued" below is when the certificate was produced, which is
                       * not when the thing was won — reissue one in September and the
                       * only date on the page would say September.
                       */
                      event?.startDate ? ["Date", formatDate(event.startDate)] : null,
                      certificate.issuedAt
                        ? ["Issued", formatDate(certificate.issuedAt)]
                        : null,
                      certificate.issuedBy ? ["Issued by", certificate.issuedBy] : null,
                      certificate.revokedReason
                        ? ["Withdrawn", certificate.revokedReason]
                        : null,
                    ]
                      .filter(Boolean)
                      .map((row) => {
                        const [label, value] = row as [string, string];
                        return (
                          <div
                            key={label}
                            className="flex items-baseline justify-between gap-4 border-b border-line pb-2 last:border-0"
                          >
                            <dt className="shrink-0 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-muted">
                              {label}
                            </dt>
                            <dd className="text-right text-[13px] font-semibold text-ink">
                              {value}
                            </dd>
                          </div>
                        );
                      })}
                  </dl>
                ) : null}

                {result.outcome === "unknown" ? (
                  <p className="mt-3 text-[12px] leading-relaxed text-muted">
                    Check the code and try again. If it still does not resolve, contact the
                    tournament office.
                  </p>
                ) : null}
              </div>
            </Card>
          </motion.div>
        ) : null}

        <p className="mt-8 text-center text-[12px] text-faint">
          <Link href="/live" className="tap-target underline underline-offset-2 hover:text-muted">
            Back to the championship site
          </Link>
        </p>
      </div>
    </main>
  );
}
