/**
 * The Art Activity form: what can be chosen, what it costs, and what must be filled in.
 *
 * The database checks the same rules again (`enforce_art_entry`, 0103); this is what lets the form
 * say so while the person is still looking at the field.
 */

import { checkProofFile, type PaymentChoice } from "./paymentProof";

export type ArtActivity = "canvas" | "tote";

export const ART_ACTIVITIES: { key: ArtActivity; label: string }[] = [
  { key: "canvas", label: "Canvas Painting" },
  { key: "tote", label: "Tote Bag Printing / Painting" },
];

export const ART_FEE = 1000;

export const artLabel = (key: ArtActivity) => ART_ACTIVITIES.find((a) => a.key === key)?.label ?? key;

/** One price per activity chosen. */
export function artTotal(chosen: ArtActivity[], fee = ART_FEE): number {
  return new Set(chosen).size * fee;
}

export interface ArtEntry {
  fullName: string;
  age: string;
  phone: string;
  email: string;
  activities: ArtActivity[];
  payment: Extract<PaymentChoice, "online" | "cash"> | null;
  proofFile: { name: string; type: string; size: number } | null;
}

export type ArtField = "fullName" | "age" | "phone" | "email" | "activities" | "payment" | "proof";

export function artProblems(e: ArtEntry): { field: ArtField; message: string }[] {
  const out: { field: ArtField; message: string }[] = [];
  if (e.fullName.trim().length < 2) out.push({ field: "fullName", message: "Please enter your full name." });
  const age = Number(e.age);
  if (!/^\d{1,2}$/.test(e.age.trim()) || age < 3 || age > 99) out.push({ field: "age", message: "Please enter your age." });
  if (e.phone.replace(/\D/g, "").length < 10) out.push({ field: "phone", message: "Please enter your phone number." });
  if (e.email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e.email.trim()))
    out.push({ field: "email", message: "That email does not look right." });
  if (e.activities.length === 0) out.push({ field: "activities", message: "Please choose at least one activity." });
  if (!e.payment) out.push({ field: "payment", message: "Please choose how you will pay." });
  if (e.payment === "online") {
    if (!e.proofFile) out.push({ field: "proof", message: "Please attach your payment proof." });
    else {
      const ok = checkProofFile(e.proofFile);
      if (!ok.ok) out.push({ field: "proof", message: ok.message });
    }
  }
  return out;
}
