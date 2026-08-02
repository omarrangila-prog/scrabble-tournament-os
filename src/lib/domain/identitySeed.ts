/**
 * Seeds a permanent identity for every demo player, plus a realistic pipeline
 * of registrations awaiting organizer review and a category ledger showing
 * past promotions. Deterministic, so a demo reset restores the same picture.
 */

import { buildSeed, rng } from "./seed";
import {
  CategoryLedgerEntry,
  CategoryRecommendation,
  PlayerCategory,
  PlayerIdentity,
  Registration,
} from "./identity";

const PROVINCE_OF: Record<string, string> = {
  Karachi: "Sindh",
  Hyderabad: "Sindh",
  Sukkur: "Sindh",
  Lahore: "Punjab",
  Faisalabad: "Punjab",
  Multan: "Punjab",
  Sialkot: "Punjab",
  Gujranwala: "Punjab",
  Bahawalpur: "Punjab",
  Sargodha: "Punjab",
  Rawalpindi: "Punjab",
  Islamabad: "Islamabad Capital Territory",
  Peshawar: "Khyber Pakhtunkhwa",
  Mardan: "Khyber Pakhtunkhwa",
  Abbottabad: "Khyber Pakhtunkhwa",
  Quetta: "Balochistan",
};

/** Birth year band per category, giving the demo field a plausible age spread. */
function birthDateFor(category: PlayerCategory, r: () => number): string {
  const spans: Record<PlayerCategory, [number, number]> = {
    beginner: [2010, 2018],
    recreational: [2008, 2012],
    advanced: [1985, 2005],
    masters: [1978, 2002],
  };
  const [from, to] = spans[category];
  const year = from + Math.floor(r() * (to - from + 1));
  const month = 1 + Math.floor(r() * 12);
  const day = 1 + Math.floor(r() * 28);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function buildIdentitySeed() {
  const seed = buildSeed();
  const r = rng(90210);

  const identities: PlayerIdentity[] = seed.players.map((p) => {
    const parts = p.fullName.split(" ");
    // Divisions and playing categories share one vocabulary.
    const category: PlayerCategory = p.division;
    const dob = birthDateFor(category, r);
    const handle = p.fullName.toLowerCase().replace(/\s+/g, ".");

    return {
      playerId: p.playerId,
      firstName: parts[0],
      lastName: parts.slice(1).join(" ") || parts[0],
      fatherName: `${["Muhammad", "Abdul", "Ghulam", "Syed"][Math.floor(r() * 4)]} ${parts.slice(-1)[0]}`,
      gender: r() < 0.34 ? "female" : "male",
      dateOfBirth: dob,
      nationality: "Pakistani",
      city: p.city,
      province: PROVINCE_OF[p.city] ?? "Sindh",
      country: "Pakistan",
      address: `House ${1 + Math.floor(r() * 480)}, Block ${String.fromCharCode(65 + Math.floor(r() * 8))}, ${p.city}`,
      mobile: p.emergencyContact.phone.replace("+92 3", "+92 30"),
      whatsapp: p.emergencyContact.phone.replace("+92 3", "+92 30"),
      email: `${handle}@example.demo`,
      emergencyContactName: p.emergencyContact.name,
      emergencyContactNumber: p.emergencyContact.phone,
      photo: {
        uploadedAt: "2026-06-15T09:00:00+05:00",
        verified: p.seed <= 16,
        fileName: `${p.playerId.toLowerCase()}-portrait.jpg`,
      },
      identityDocument:
        p.seed <= 20
          ? {
              kind: category === "beginner" || category === "recreational" ? "student-card" : "cnic",
              verified: p.seed <= 12,
              fileName: `${p.playerId.toLowerCase()}-id.pdf`,
            }
          : undefined,
      category,
      club: p.club,
      registeredAt: p.registeredAt,
      verified: p.ratingStatus === "rated" && p.seed <= 12,
    } satisfies PlayerIdentity;
  });

  /* ---- Category ledger: initial entries plus a few past decisions ------ */
  const ledger: CategoryLedgerEntry[] = identities.map((i) => ({
    id: `cat-init-${i.playerId}`,
    playerId: i.playerId,
    from: null,
    to: i.category,
    kind: "initial" as const,
    reason: "Category assigned at first registration.",
    decidedBy: "Sir Hani",
    at: i.registeredAt,
  }));

  // Two historical promotions so the ledger reads as a living record.
  const promoted = identities.filter((i) => i.category === "masters").slice(0, 2);
  for (const i of promoted) {
    ledger.unshift({
      id: `cat-hist-${i.playerId}`,
      playerId: i.playerId,
      from: "advanced",
      to: "masters",
      kind: "promotion",
      reason:
        "Sustained 71% win rate with a positive spread across five events. Promotion approved by the Tournament Director.",
      decidedBy: "Sir Hani",
      at: "2025-11-18T16:30:00+05:00",
    });
  }

  /* ---- Registration pipeline ------------------------------------------ */
  const registrations: Registration[] = [];
  const T = (h: number, m: number) =>
    new Date(`2026-07-30T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00+05:00`).toISOString();

  // Three new-player applications awaiting review.
  const applicants: {
    first: string; last: string; father: string; city: string; category: PlayerCategory;
    dob: string; method: Registration["payment"]["method"]; status: Registration["status"];
    gender: PlayerIdentity["gender"];
  }[] = [
    { first: "Hina", last: "Sattar", father: "Abdul Sattar", city: "Lahore", category: "recreational", dob: "2009-03-14", method: "easypaisa", status: "payment-review", gender: "female" },
    { first: "Talha", last: "Bashir", father: "Muhammad Bashir", city: "Karachi", category: "advanced", dob: "1997-11-02", method: "bank-transfer", status: "payment-review", gender: "male" },
    { first: "Zoya", last: "Kamal", father: "Kamal Ahmed", city: "Islamabad", category: "beginner", dob: "2014-06-21", method: "jazzcash", status: "submitted", gender: "female" },
  ];

  applicants.forEach((a, idx) => {
    registrations.push({
      id: `reg-new-${idx + 1}`,
      tournamentId: seed.tournament.id,
      playerId: null,
      isNewPlayer: true,
      applicant: {
        playerId: "",
        firstName: a.first,
        lastName: a.last,
        fatherName: a.father,
        gender: a.gender,
        dateOfBirth: a.dob,
        nationality: "Pakistani",
        city: a.city,
        province: PROVINCE_OF[a.city] ?? "Punjab",
        country: "Pakistan",
        address: `House ${20 + idx * 7}, ${a.city}`,
        mobile: `+92 30${idx}${1234567 + idx}`,
        whatsapp: `+92 30${idx}${1234567 + idx}`,
        email: `${a.first.toLowerCase()}.${a.last.toLowerCase()}@example.demo`,
        emergencyContactName: a.father,
        emergencyContactNumber: `+92 31${idx}${7654321 - idx}`,
        photo: { uploadedAt: T(10, 12 + idx), verified: false, fileName: `${a.first.toLowerCase()}-portrait.jpg` },
        identityDocument:
          idx < 2
            ? { kind: a.category === "beginner" ? "student-card" : "cnic", verified: false, fileName: `${a.first.toLowerCase()}-id.pdf` }
            : undefined,
        category: a.category,
        club: idx === 0 ? "Lahore Word Masters" : idx === 1 ? "Karachi Scrabble Club" : "Roots International",
      },
      category: a.category,
      status: a.status,
      payment: {
        method: a.method,
        amount: seed.tournament.registrationFee,
        currency: "PKR",
        reference: `TX-${90210 + idx}`,
        proofFileName: a.status === "submitted" ? undefined : `receipt-${idx + 1}.jpg`,
        receivedAt: a.status === "submitted" ? undefined : T(10, 15 + idx),
      },
      submittedAt: T(10, 10 + idx),
      timeline: [
        { at: T(10, 10 + idx), by: `${a.first} ${a.last}`, entry: "Registration submitted." },
        ...(a.status === "payment-review"
          ? [{ at: T(10, 15 + idx), by: `${a.first} ${a.last}`, entry: "Payment proof uploaded." }]
          : []),
      ],
    });
  });

  // One returning player whose identity is already known.
  const returning = identities[7];
  registrations.push({
    id: "reg-existing-1",
    tournamentId: seed.tournament.id,
    playerId: returning.playerId,
    isNewPlayer: false,
    applicant: { ...returning },
    category: returning.category,
    status: "payment-review",
    payment: {
      method: "card",
      amount: seed.tournament.registrationFee,
      currency: "PKR",
      reference: "TX-90777",
      proofFileName: "card-receipt.pdf",
      receivedAt: T(9, 40),
    },
    submittedAt: T(9, 35),
    timeline: [
      { at: T(9, 35), by: `${returning.firstName} ${returning.lastName}`, entry: "Registration submitted using existing Player ID." },
      { at: T(9, 40), by: "Payment gateway", entry: "Card payment received." },
    ],
  });

  // Two already approved, so the queue shows a full lifecycle.
  for (let i = 0; i < 2; i++) {
    const p = identities[20 + i];
    registrations.push({
      id: `reg-approved-${i + 1}`,
      tournamentId: seed.tournament.id,
      playerId: p.playerId,
      isNewPlayer: false,
      applicant: { ...p },
      category: p.category,
      status: "approved",
      payment: {
        method: "bank-transfer",
        amount: seed.tournament.registrationFee,
        currency: "PKR",
        reference: `TX-885${i}`,
        proofFileName: `transfer-${i + 1}.jpg`,
        receivedAt: T(8, 20 + i),
        verifiedBy: "Sir Hani",
      },
      submittedAt: T(8, 15 + i),
      decidedAt: T(8, 40 + i),
      decidedBy: "Sir Hani",
      timeline: [
        { at: T(8, 15 + i), by: `${p.firstName} ${p.lastName}`, entry: "Registration submitted." },
        { at: T(8, 40 + i), by: "Sir Hani", entry: "Approved. Existing identity linked." },
      ],
    });
  }

  return {
    identities,
    registrations,
    ledger,
    recommendations: [] as CategoryRecommendation[],
    // The next ID continues after the highest issued so far.
    idSequence: seed.players.length,
  };
}
