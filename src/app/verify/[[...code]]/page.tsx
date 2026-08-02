"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import { BadgeCheck, CircleHelp, Search, ShieldOff } from "lucide-react";
import { Button, Card, Field, Input } from "@/components/ui";
import { useCertificateStore } from "@/lib/store/useCertificateStore";
import { useEventStore } from "@/lib/store/useEventStore";
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
  const fromUrl = params.code?.[0] ? decodeURIComponent(params.code[0]) : "";

  const certs = useCertificateStore();
  const events = useEventStore();

  const [input, setInput] = React.useState(fromUrl);
  const [submitted, setSubmitted] = React.useState(fromUrl);

  const result = submitted.trim() ? certs.verify(submitted) : null;
  const certificate = result?.certificate;
  const event = certificate ? events.events.find((e) => e.id === certificate.eventId) : undefined;

  const style = result ? OUTCOME[result.outcome] : null;

  return (
    <main className="board-motif min-h-dvh px-4 py-12">
      <div className="mx-auto w-full max-w-[560px]">
        <div className="text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-muted">
            Bluffy Alphabattle
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
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink">{result.message}</p>

                {certificate && result.outcome !== "unknown" ? (
                  <dl className="mt-5 space-y-2.5 text-left">
                    {[
                      ["Recipient", certificate.recipientName],
                      ["Achievement", certificate.statement],
                      ["Type", CERTIFICATE_KIND_LABEL[certificate.kind]],
                      certificate.division ? ["Division", certificate.division] : null,
                      certificate.detail ? ["Detail", certificate.detail] : null,
                      event ? ["Event", event.name] : null,
                      certificate.issuedAt
                        ? ["Issued", formatDate(certificate.issuedAt)]
                        : null,
                      certificate.issuedBy ? ["Issued by", certificate.issuedBy] : null,
                      certificate.revokedAt
                        ? ["Withdrawn", formatDate(certificate.revokedAt)]
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
          <Link href="/live" className="underline underline-offset-2 hover:text-muted">
            Back to the championship site
          </Link>
        </p>
      </div>
    </main>
  );
}
