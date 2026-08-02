"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Camera,
  CheckCircle2,
  CreditCard,
  IdCard,
  Info,
  LayoutGrid,
  Search,
  ShieldCheck,
  Upload,
  UserPlus,
} from "lucide-react";
import {
  Avatar,
  Button,
  Card,
  Field,
  Input,
  Progress,
  Select,
  Textarea,
} from "@/components/ui";
import { useStore } from "@/lib/store/useStore";
import { useIdentityStore } from "@/lib/store/useIdentityStore";
import {
  CATEGORY_DESCRIPTION,
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  PAYMENT_METHOD_LABEL,
  PaymentMethod,
  PlayerCategory,
  PlayerIdentity,
  ageOn,
  categoryEligibility,
  fullNameOf,
} from "@/lib/domain/identity";
import { cn, formatDate } from "@/lib/utils";

const STEPS = [
  "Player",
  "Personal details",
  "Contact",
  "Category",
  "Photo & documents",
  "Payment",
  "Review",
];

interface FormState {
  mode: "new" | "existing";
  existingPlayerId: string;
  firstName: string;
  middleName: string;
  lastName: string;
  fatherName: string;
  gender: PlayerIdentity["gender"];
  dateOfBirth: string;
  nationality: string;
  city: string;
  province: string;
  country: string;
  address: string;
  mobile: string;
  whatsapp: string;
  email: string;
  emergencyContactName: string;
  emergencyContactNumber: string;
  club: string;
  category: PlayerCategory;
  photoName: string;
  documentKind: "cnic" | "passport" | "student-card" | "";
  documentName: string;
  paymentMethod: PaymentMethod;
  paymentReference: string;
  paymentProofName: string;
}

const INITIAL: FormState = {
  mode: "new",
  existingPlayerId: "",
  firstName: "",
  middleName: "",
  lastName: "",
  fatherName: "",
  gender: "male",
  dateOfBirth: "",
  nationality: "Pakistani",
  city: "",
  province: "Sindh",
  country: "Pakistan",
  address: "",
  mobile: "",
  whatsapp: "",
  email: "",
  emergencyContactName: "",
  emergencyContactNumber: "",
  club: "",
  category: "recreational",
  photoName: "",
  documentKind: "",
  documentName: "",
  paymentMethod: "easypaisa",
  paymentReference: "",
  paymentProofName: "",
};

export default function RegistrationPage() {
  const params = useParams<{ tournamentId: string }>();
  const store = useStore();
  const identityStore = useIdentityStore();
  const { tournaments, players, venue } = store;

  const tournament =
    tournaments.find((t) => t.id === params.tournamentId) ?? store.tournament;

  const [step, setStep] = React.useState(0);
  const [form, setForm] = React.useState<FormState>(INITIAL);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [lookup, setLookup] = React.useState("");
  const [submitted, setSubmitted] = React.useState<{ id: string; playerId: string | null } | null>(null);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => {
      const next = { ...e };
      delete next[k as string];
      return next;
    });
  };

  /* ---- Existing player lookup ----------------------------------------- */
  const matches = React.useMemo(() => {
    const q = lookup.trim().toLowerCase();
    if (!q) return [];
    return identityStore.identities
      .filter(
        (i) =>
          i.playerId.toLowerCase().includes(q) ||
          fullNameOf(i).toLowerCase().includes(q) ||
          i.mobile.replace(/\s/g, "").includes(q.replace(/\s/g, "")) ||
          i.email.toLowerCase().includes(q),
      )
      .slice(0, 6);
  }, [lookup, identityStore.identities]);

  const linkedIdentity = form.existingPlayerId
    ? identityStore.identities.find((i) => i.playerId === form.existingPlayerId)
    : undefined;

  const applyIdentity = (identity: PlayerIdentity) => {
    setForm((f) => ({
      ...f,
      mode: "existing",
      existingPlayerId: identity.playerId,
      firstName: identity.firstName,
      middleName: identity.middleName ?? "",
      lastName: identity.lastName,
      fatherName: identity.fatherName,
      gender: identity.gender,
      dateOfBirth: identity.dateOfBirth,
      nationality: identity.nationality,
      city: identity.city,
      province: identity.province,
      country: identity.country,
      address: identity.address,
      mobile: identity.mobile,
      whatsapp: identity.whatsapp ?? "",
      email: identity.email,
      emergencyContactName: identity.emergencyContactName,
      emergencyContactNumber: identity.emergencyContactNumber,
      club: identity.club,
      category: identity.category,
      photoName: identity.photo?.fileName ?? "",
      documentKind: identity.identityDocument?.kind ?? "",
      documentName: identity.identityDocument?.fileName ?? "",
    }));
    setLookup("");
    // A returning player skips straight to the tournament-specific steps.
    setStep(3);
  };

  const age = form.dateOfBirth ? ageOn(form.dateOfBirth) : 0;
  const eligibility = categoryEligibility(form.category, {});

  /* ---- Validation ------------------------------------------------------ */
  const validate = (target: number): boolean => {
    const e: Record<string, string> = {};

    if (target > 1 && form.mode === "new") {
      if (!form.firstName.trim()) e.firstName = "Enter the player's first name.";
      if (!form.lastName.trim()) e.lastName = "Enter the player's last name.";
      if (!form.fatherName.trim()) e.fatherName = "Enter the father's name.";
      if (!form.dateOfBirth) e.dateOfBirth = "Select a date of birth.";
      else if (age < 4 || age > 100) e.dateOfBirth = "Check the date of birth — the age looks incorrect.";
      if (!form.city.trim()) e.city = "Enter a city.";
      if (!form.address.trim()) e.address = "Enter a complete address.";
    }

    if (target > 2 && form.mode === "new") {
      if (!/^\+?[\d\s-]{10,}$/.test(form.mobile.trim())) e.mobile = "Enter a valid mobile number.";
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())) e.email = "Enter a valid email address.";
      if (!form.emergencyContactName.trim()) e.emergencyContactName = "Enter an emergency contact name.";
      if (!/^\+?[\d\s-]{10,}$/.test(form.emergencyContactNumber.trim()))
        e.emergencyContactNumber = "Enter a valid emergency contact number.";
    }

    if (target > 3 && !eligibility.eligible) {
      e.category = eligibility.reason ?? "This category is not available for this player.";
    }

    if (target > 4 && !form.photoName) {
      e.photoName = "A passport-style photograph is required.";
    }

    if (target > 5) {
      if (!form.paymentReference.trim()) e.paymentReference = "Enter the payment reference.";
      if (!form.paymentProofName) e.paymentProofName = "Upload the payment receipt or screenshot.";
    }

    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const next = () => {
    if (!validate(step + 1)) return;
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  };

  const submit = () => {
    if (!validate(6)) return;

    const applicant: Omit<PlayerIdentity, "registeredAt" | "verified"> = {
      playerId: form.existingPlayerId || "",
      firstName: form.firstName.trim(),
      middleName: form.middleName.trim() || undefined,
      lastName: form.lastName.trim(),
      fatherName: form.fatherName.trim(),
      gender: form.gender,
      dateOfBirth: form.dateOfBirth,
      nationality: form.nationality,
      city: form.city.trim(),
      province: form.province,
      country: form.country,
      address: form.address.trim(),
      mobile: form.mobile.trim(),
      whatsapp: form.whatsapp.trim() || undefined,
      email: form.email.trim(),
      emergencyContactName: form.emergencyContactName.trim(),
      emergencyContactNumber: form.emergencyContactNumber.trim(),
      photo: form.photoName
        ? { uploadedAt: new Date().toISOString(), verified: false, fileName: form.photoName }
        : undefined,
      identityDocument:
        form.documentKind && form.documentName
          ? { kind: form.documentKind, verified: false, fileName: form.documentName }
          : undefined,
      category: form.category,
      club: form.club.trim() || "Unaffiliated",
    };

    const reg = identityStore.submitRegistration(
      {
        tournamentId: tournament.id,
        playerId: form.existingPlayerId || null,
        isNewPlayer: form.mode === "new",
        applicant,
        category: form.category,
        status: "payment-review",
        payment: {
          method: form.paymentMethod,
          amount: tournament.registrationFee,
          currency: tournament.currency,
          reference: form.paymentReference.trim(),
          proofFileName: form.paymentProofName,
          receivedAt: new Date().toISOString(),
        },
      },
      fullNameOf(applicant),
    );

    setSubmitted({ id: reg.id, playerId: form.existingPlayerId || null });
  };

  /* ---- Confirmation ---------------------------------------------------- */
  if (submitted) {
    return (
      <div className="min-h-dvh">
        <PublicHeader />
        <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
            <Card className="p-7 text-center">
              <span className="mx-auto grid size-14 place-items-center rounded-card bg-success-050 text-success">
                <CheckCircle2 className="size-7" />
              </span>
              <h1 className="mt-4 text-[22px] font-semibold tracking-[-0.02em] text-ink">
                Registration submitted
              </h1>
              <p className="mx-auto mt-2 max-w-md text-[14px] leading-relaxed text-muted">
                Your registration for {tournament.name.replace(" — Demo", "")} has been received and
                is awaiting organizer review.
              </p>

              <div className="mt-5 space-y-2 text-left">
                <StatusLine done label="Registration submitted" />
                <StatusLine done label="Payment proof uploaded" />
                <StatusLine label="Payment under review by the organizer" active />
                <StatusLine
                  label={
                    submitted.playerId
                      ? "Approval — your existing Player ID will be linked"
                      : "Approval — your permanent Player ID will be issued"
                  }
                />
              </div>

              {submitted.playerId ? (
                <div className="mt-5 rounded-compact bg-primary-050 px-4 py-3">
                  <p className="text-[12.5px] text-muted">Your permanent Player ID</p>
                  <p className="text-[20px] font-bold text-primary num">{submitted.playerId}</p>
                </div>
              ) : (
                <p className="mt-5 rounded-compact bg-secondary-050 px-4 py-3 text-[12.5px] leading-relaxed text-[#2b7fd4]">
                  A permanent Player ID will be issued once the organizer approves your
                  registration. It stays with you for your whole career — you will never need to
                  register again.
                </p>
              )}

              <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
                <Link href="/register">
                  <Button variant="secondary">Back to tournaments</Button>
                </Link>
                <Link href="/live">
                  <Button variant="primary">View live results</Button>
                </Link>
              </div>
            </Card>
          </motion.div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-dvh">
      <PublicHeader />

      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
        {/* Tournament summary */}
        <Card className="mb-5 overflow-hidden">
          <div className="relative h-20 overflow-hidden">
            <div className="absolute inset-0" style={{ background: "linear-gradient(115deg,#6D5DFB 0%,#4BA8FF 100%)" }} />
            <div className="board-motif absolute inset-0 opacity-25" aria-hidden />
          </div>
          <div className="p-5">
            <h1 className="text-[18px] font-semibold tracking-[-0.02em] text-ink">
              {tournament.name.replace(" — Demo", "")}
            </h1>
            <p className="mt-1 text-[12.5px] text-muted">
              {venue.name}, {tournament.city} · {formatDate(tournament.startDate)} –{" "}
              {formatDate(tournament.endDate)} · Entry PKR{" "}
              {tournament.registrationFee.toLocaleString("en-PK")}
            </p>
          </div>
        </Card>

        {/* Progress */}
        <div className="mb-5">
          <div className="mb-2 flex items-baseline justify-between">
            <p className="text-[13px] font-medium text-ink">
              Step {step + 1} of {STEPS.length} — {STEPS[step]}
            </p>
            <p className="text-[12px] text-muted num">
              {Math.round(((step + 1) / STEPS.length) * 100)}%
            </p>
          </div>
          <Progress value={((step + 1) / STEPS.length) * 100} label="Registration progress" />
        </div>

        <Card className="p-5 sm:p-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.2 }}
            >
              {/* STEP 0 — new or existing */}
              {step === 0 ? (
                <div className="space-y-4">
                  <SectionTitle
                    title="Are you registering for the first time?"
                    subtitle="Returning players keep the same Player ID for life."
                  />

                  <div className="grid gap-3 sm:grid-cols-2">
                    <ModeCard
                      selected={form.mode === "new"}
                      onClick={() => set("mode", "new")}
                      icon={<UserPlus className="size-5" />}
                      title="New player"
                      body="I have never played a rated tournament before. Issue me a permanent Player ID."
                    />
                    <ModeCard
                      selected={form.mode === "existing"}
                      onClick={() => set("mode", "existing")}
                      icon={<IdCard className="size-5" />}
                      title="Existing player"
                      body="I already have a Player ID. Retrieve my profile so I do not fill this in again."
                    />
                  </div>

                  {form.mode === "existing" ? (
                    <div className="rounded-compact bg-[rgb(var(--c-surface))] p-4">
                      <p className="mb-2 text-[13px] font-medium text-ink">
                        Find your profile
                      </p>
                      <div className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
                        <Input
                          value={lookup}
                          onChange={(e) => setLookup(e.target.value)}
                          placeholder="Player ID, name, mobile number or email"
                          className="pl-9"
                        />
                      </div>

                      {matches.length > 0 ? (
                        <ul className="mt-2 space-y-1.5">
                          {matches.map((m) => {
                            const p = players.find((x) => x.playerId === m.playerId);
                            return (
                              <li key={m.playerId}>
                                <button
                                  onClick={() => applyIdentity(m)}
                                  className="flex w-full items-center gap-3 rounded-control border border-[rgb(var(--glass-border))] bg-white px-3 py-2.5 text-left transition-colors hover:border-primary/30 hover:bg-primary-050"
                                >
                                  <Avatar initials={p?.initials ?? m.firstName[0]} hue={p?.avatarHue ?? 210} size={34} />
                                  <span className="min-w-0 flex-1">
                                    <span className="block truncate text-[13.5px] font-medium text-ink">
                                      {fullNameOf(m)}
                                    </span>
                                    <span className="block truncate text-[11.5px] text-muted">
                                      {m.playerId} · {m.city} · {CATEGORY_LABEL[m.category]}
                                    </span>
                                  </span>
                                  {m.verified ? <BadgeCheck className="size-4 shrink-0 text-secondary" /> : null}
                                  <ArrowRight className="size-4 shrink-0 text-faint" />
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      ) : lookup.trim() ? (
                        <p className="mt-2 rounded-control bg-warning-050/70 px-3 py-2.5 text-[12.5px] text-[#b4741f]">
                          No profile matches that search. Check the details, or register as a new
                          player.
                        </p>
                      ) : (
                        <p className="mt-2 text-[12px] text-muted">
                          Try a Player ID such as PK-003, or search by your registered name.
                        </p>
                      )}

                      {linkedIdentity ? (
                        <div className="mt-3 rounded-control bg-success-050 px-3.5 py-3">
                          <p className="flex items-center gap-2 text-[13px] font-semibold text-ink">
                            <CheckCircle2 className="size-4 text-success" />
                            Profile linked: {fullNameOf(linkedIdentity)} ({linkedIdentity.playerId})
                          </p>
                          <p className="mt-1 text-[12px] text-muted">
                            Only tournament-specific details are needed from here.
                          </p>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {/* STEP 1 — personal */}
              {step === 1 ? (
                <div className="space-y-4">
                  <SectionTitle title="Personal information" subtitle="Recorded once against your permanent Player ID." />
                  {form.mode === "existing" ? <LockedNotice /> : null}

                  <div className="grid gap-3.5 sm:grid-cols-2">
                    <Field label="First name" required error={errors.firstName}>
                      <Input value={form.firstName} onChange={(e) => set("firstName", e.target.value)} invalid={!!errors.firstName} />
                    </Field>
                    <Field label="Middle name">
                      <Input value={form.middleName} onChange={(e) => set("middleName", e.target.value)} />
                    </Field>
                    <Field label="Last name" required error={errors.lastName}>
                      <Input value={form.lastName} onChange={(e) => set("lastName", e.target.value)} invalid={!!errors.lastName} />
                    </Field>
                    <Field label="Father's name" required error={errors.fatherName}>
                      <Input value={form.fatherName} onChange={(e) => set("fatherName", e.target.value)} invalid={!!errors.fatherName} />
                    </Field>
                    <Field label="Gender" required>
                      <Select value={form.gender} onChange={(e) => set("gender", e.target.value as FormState["gender"])}>
                        <option value="male">Male</option>
                        <option value="female">Female</option>
                        <option value="prefer-not-to-say">Prefer not to say</option>
                      </Select>
                    </Field>
                    <Field
                      label="Date of birth"
                      required
                      error={errors.dateOfBirth}
                      hint={form.dateOfBirth ? `Age ${age} years` : "Used to check category eligibility."}
                    >
                      <Input type="date" value={form.dateOfBirth} onChange={(e) => set("dateOfBirth", e.target.value)} invalid={!!errors.dateOfBirth} />
                    </Field>
                    <Field label="Nationality" required>
                      <Input value={form.nationality} onChange={(e) => set("nationality", e.target.value)} />
                    </Field>
                    <Field label="City" required error={errors.city}>
                      <Input value={form.city} onChange={(e) => set("city", e.target.value)} invalid={!!errors.city} />
                    </Field>
                    <Field label="Province" required>
                      <Select value={form.province} onChange={(e) => set("province", e.target.value)}>
                        {["Sindh", "Punjab", "Khyber Pakhtunkhwa", "Balochistan", "Islamabad Capital Territory", "Gilgit-Baltistan", "Azad Jammu & Kashmir"].map((p) => (
                          <option key={p} value={p}>{p}</option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Country" required>
                      <Input value={form.country} onChange={(e) => set("country", e.target.value)} />
                    </Field>
                    <Field label="Complete address" required error={errors.address} className="sm:col-span-2">
                      <Textarea rows={2} value={form.address} onChange={(e) => set("address", e.target.value)} />
                    </Field>
                    <Field label="Club or school" className="sm:col-span-2" hint="Leave blank if you are unaffiliated.">
                      <Input value={form.club} onChange={(e) => set("club", e.target.value)} />
                    </Field>
                  </div>
                </div>
              ) : null}

              {/* STEP 2 — contact */}
              {step === 2 ? (
                <div className="space-y-4">
                  <SectionTitle title="Contact information" subtitle="Used for pairing alerts, board changes and result confirmations." />
                  <div className="grid gap-3.5 sm:grid-cols-2">
                    <Field label="Mobile number" required error={errors.mobile}>
                      <Input value={form.mobile} onChange={(e) => set("mobile", e.target.value)} placeholder="+92 300 0000000" invalid={!!errors.mobile} />
                    </Field>
                    <Field label="WhatsApp number" hint="Leave blank to use the mobile number.">
                      <Input value={form.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} placeholder="+92 300 0000000" />
                    </Field>
                    <Field label="Email address" required error={errors.email} className="sm:col-span-2">
                      <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} invalid={!!errors.email} />
                    </Field>
                    <Field label="Emergency contact name" required error={errors.emergencyContactName}>
                      <Input value={form.emergencyContactName} onChange={(e) => set("emergencyContactName", e.target.value)} invalid={!!errors.emergencyContactName} />
                    </Field>
                    <Field label="Emergency contact number" required error={errors.emergencyContactNumber}>
                      <Input value={form.emergencyContactNumber} onChange={(e) => set("emergencyContactNumber", e.target.value)} invalid={!!errors.emergencyContactNumber} />
                    </Field>
                  </div>
                </div>
              ) : null}

              {/* STEP 3 — category */}
              {step === 3 ? (
                <div className="space-y-4">
                  <SectionTitle title="Playing category" subtitle="Recorded permanently in your tournament history." />

                  <div className="grid gap-2.5 sm:grid-cols-2">
                    {CATEGORY_ORDER.map((c) => {
                      const check = categoryEligibility(c, {});
                      const disabled = !check.eligible;
                      return (
                        <button
                          key={c}
                          onClick={() => set("category", c)}
                          className={cn(
                            "rounded-compact border p-4 text-left transition-all",
                            form.category === c
                              ? "border-primary bg-primary-050 shadow-[0_6px_18px_rgba(109,93,251,0.14)]"
                              : "border-line-strong bg-[rgb(var(--c-surface))] hover:bg-[rgb(var(--c-surface-strong))]",
                            disabled && "opacity-65",
                          )}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-[14.5px] font-semibold text-ink">{CATEGORY_LABEL[c]}</p>
                            {form.category === c ? <CheckCircle2 className="size-4 shrink-0 text-primary" /> : null}
                          </div>
                          <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
                            {CATEGORY_DESCRIPTION[c]}
                          </p>
                          {disabled ? (
                            <p className="mt-1.5 text-[11.5px] text-[#b4741f]">
                              Not available for this date of birth.
                            </p>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>

                  {!eligibility.eligible ? (
                    <p className="rounded-control bg-warning-050/70 px-3.5 py-3 text-[12.5px] leading-relaxed text-[#b4741f]">
                      {eligibility.reason}
                    </p>
                  ) : null}
                  {errors.category ? (
                    <p className="rounded-control bg-critical-050 px-3.5 py-3 text-[12.5px] text-[#c93a51]">
                      {errors.category}
                    </p>
                  ) : null}

                  <p className="flex items-start gap-1.5 rounded-control bg-secondary-050 px-3.5 py-3 text-[12px] leading-relaxed text-[#2b7fd4]">
                    <Info className="mt-px size-3.5 shrink-0" />
                    Your category is reviewed over time from your results. Promotions and demotions
                    are recommended by the system and confirmed by the Tournament Director — never
                    applied automatically.
                  </p>
                </div>
              ) : null}

              {/* STEP 4 — photo and documents */}
              {step === 4 ? (
                <div className="space-y-4">
                  <SectionTitle title="Photograph and documents" subtitle="Your photo becomes the official Player ID picture." />

                  <UploadBox
                    icon={<Camera className="size-6" />}
                    title="Passport-style photograph"
                    hint="Front-facing, clear background, JPG or PNG, minimum 600×600."
                    fileName={form.photoName}
                    required
                    error={errors.photoName}
                    onUpload={() => set("photoName", `${form.firstName.toLowerCase() || "player"}-portrait.jpg`)}
                  />

                  <div className="rounded-compact bg-[rgb(var(--c-surface))] p-4">
                    <p className="text-[13px] font-medium text-ink">Identity document</p>
                    <p className="mt-0.5 text-[12px] text-muted">
                      Optional, but it speeds up verification and unlocks the verified badge.
                    </p>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <Field label="Document type">
                        <Select value={form.documentKind} onChange={(e) => set("documentKind", e.target.value as FormState["documentKind"])}>
                          <option value="">Not provided</option>
                          <option value="cnic">CNIC</option>
                          <option value="passport">Passport</option>
                          <option value="student-card">Student card</option>
                        </Select>
                      </Field>
                      <div className="flex items-end">
                        <Button
                          variant="secondary"
                          className="w-full"
                          disabled={!form.documentKind}
                          icon={<Upload className="size-4" />}
                          onClick={() => set("documentName", `${form.documentKind}-${form.lastName.toLowerCase() || "player"}.pdf`)}
                        >
                          {form.documentName ? "Replace file" : "Upload document"}
                        </Button>
                      </div>
                    </div>
                    {form.documentName ? (
                      <p className="mt-2 flex items-center gap-1.5 text-[12px] text-success">
                        <CheckCircle2 className="size-3.5" />
                        {form.documentName}
                      </p>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {/* STEP 5 — payment */}
              {step === 5 ? (
                <div className="space-y-4">
                  <SectionTitle
                    title="Payment"
                    subtitle={`Entry fee PKR ${tournament.registrationFee.toLocaleString("en-PK")}. Registration stays pending until the organizer verifies payment.`}
                  />

                  <div>
                    <p className="mb-1.5 text-[13px] font-medium text-ink">Payment method</p>
                    <div className="grid gap-2 sm:grid-cols-3">
                      {(Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[]).map((m) => (
                        <button
                          key={m}
                          onClick={() => set("paymentMethod", m)}
                          className={cn(
                            "rounded-control border px-3 py-2.5 text-left text-[12.5px] transition-colors",
                            form.paymentMethod === m
                              ? "border-primary bg-primary-050 text-primary-600"
                              : "border-line-strong bg-[rgb(var(--c-surface))] text-ink hover:bg-[rgb(var(--c-surface-strong))]",
                          )}
                        >
                          {PAYMENT_METHOD_LABEL[m]}
                        </button>
                      ))}
                    </div>
                  </div>

                  <Field label="Payment reference or transaction ID" required error={errors.paymentReference}>
                    <Input value={form.paymentReference} onChange={(e) => set("paymentReference", e.target.value)} placeholder="e.g. TX-90210" invalid={!!errors.paymentReference} />
                  </Field>

                  <UploadBox
                    icon={<CreditCard className="size-6" />}
                    title="Payment receipt or screenshot"
                    hint="Required. The organizer verifies this before approving your registration."
                    fileName={form.paymentProofName}
                    required
                    error={errors.paymentProofName}
                    onUpload={() => set("paymentProofName", "payment-receipt.jpg")}
                  />
                </div>
              ) : null}

              {/* STEP 6 — review */}
              {step === 6 ? (
                <div className="space-y-4">
                  <SectionTitle title="Review and submit" subtitle="Check everything before submitting." />

                  <ReviewBlock
                    title="Player"
                    rows={[
                      ["Type", form.mode === "new" ? "New player" : `Existing player (${form.existingPlayerId})`],
                      ["Full name", fullNameOf({ firstName: form.firstName, middleName: form.middleName, lastName: form.lastName })],
                      ["Father's name", form.fatherName],
                      ["Date of birth", form.dateOfBirth ? `${formatDate(form.dateOfBirth)} (age ${age})` : "—"],
                      ["City", `${form.city}, ${form.province}`],
                      ["Club", form.club || "Unaffiliated"],
                    ]}
                  />
                  <ReviewBlock
                    title="Contact"
                    rows={[
                      ["Mobile", form.mobile],
                      ["Email", form.email],
                      ["Emergency contact", `${form.emergencyContactName} · ${form.emergencyContactNumber}`],
                    ]}
                  />
                  <ReviewBlock
                    title="Tournament"
                    rows={[
                      ["Event", tournament.name.replace(" — Demo", "")],
                      ["Category", CATEGORY_LABEL[form.category]],
                      ["Photograph", form.photoName || "Not provided"],
                      ["Identity document", form.documentName || "Not provided"],
                    ]}
                  />
                  <ReviewBlock
                    title="Payment"
                    rows={[
                      ["Method", PAYMENT_METHOD_LABEL[form.paymentMethod]],
                      ["Amount", `PKR ${tournament.registrationFee.toLocaleString("en-PK")}`],
                      ["Reference", form.paymentReference],
                      ["Receipt", form.paymentProofName || "Not provided"],
                    ]}
                  />

                  {form.mode === "new" ? (
                    <p className="flex items-start gap-1.5 rounded-control bg-secondary-050 px-3.5 py-3 text-[12px] leading-relaxed text-[#2b7fd4]">
                      <ShieldCheck className="mt-px size-3.5 shrink-0" />
                      On approval you will be issued a permanent Player ID, a QR code and a digital
                      player card. That identity stays with you for every future event.
                    </p>
                  ) : null}
                </div>
              ) : null}
            </motion.div>
          </AnimatePresence>

          {/* Navigation */}
          <div className="mt-6 flex items-center justify-between gap-2 border-t border-line pt-4">
            <Button
              variant="secondary"
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              disabled={step === 0}
              icon={<ArrowLeft className="size-4" />}
            >
              Back
            </Button>

            {step === STEPS.length - 1 ? (
              <Button variant="primary" onClick={submit} icon={<CheckCircle2 className="size-4" />}>
                Submit registration
              </Button>
            ) : (
              <Button
                variant="primary"
                onClick={next}
                disabled={step === 0 && form.mode === "existing" && !form.existingPlayerId}
                icon={<ArrowRight className="size-4" />}
              >
                Continue
              </Button>
            )}
          </div>
        </Card>
      </main>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function PublicHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-[rgb(var(--glass-border))] bg-[rgb(var(--c-surface))] backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1400px] items-center gap-3 px-4 py-3 sm:px-6">
        <Link href="/register" className="flex min-w-0 items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-control bg-primary text-white">
            <LayoutGrid className="size-4.5" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[14px] font-semibold tracking-[-0.01em] text-ink">Bluffy Alphabattle</p>
            <p className="truncate text-[11.5px] text-muted">Player registration</p>
          </div>
        </Link>
        <Link href="/register" className="ml-auto">
          <Button size="sm" variant="ghost">All tournaments</Button>
        </Link>
      </div>
    </header>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div>
      <h2 className="text-[17px] font-semibold tracking-[-0.015em] text-ink">{title}</h2>
      {subtitle ? <p className="mt-1 text-[13px] leading-relaxed text-muted">{subtitle}</p> : null}
    </div>
  );
}

function ModeCard({
  selected,
  onClick,
  icon,
  title,
  body,
}: {
  selected: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-compact border p-4 text-left transition-all",
        selected
          ? "border-primary bg-primary-050 shadow-[0_6px_18px_rgba(109,93,251,0.14)]"
          : "border-line-strong bg-[rgb(var(--c-surface))] hover:bg-[rgb(var(--c-surface-strong))]",
      )}
    >
      <span className={cn("grid size-10 place-items-center rounded-control", selected ? "bg-primary text-white" : "bg-primary-050 text-primary")}>
        {icon}
      </span>
      <p className="mt-2.5 text-[14.5px] font-semibold text-ink">{title}</p>
      <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{body}</p>
    </button>
  );
}

function LockedNotice() {
  return (
    <p className="flex items-start gap-1.5 rounded-control bg-success-050 px-3.5 py-3 text-[12px] leading-relaxed text-[#1b8f68]">
      <CheckCircle2 className="mt-px size-3.5 shrink-0" />
      These details were retrieved from your existing profile. Update anything that has changed.
    </p>
  );
}

function UploadBox({
  icon,
  title,
  hint,
  fileName,
  required,
  error,
  onUpload,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
  fileName: string;
  required?: boolean;
  error?: string;
  onUpload: () => void;
}) {
  return (
    <div>
      <div
        className={cn(
          "board-motif rounded-compact border border-dashed p-5 text-center",
          error ? "border-critical bg-critical-050/30" : fileName ? "border-success/40 bg-success-050/30" : "border-line-strong",
        )}
      >
        <span className={cn("mx-auto grid size-12 place-items-center rounded-compact", fileName ? "bg-success-050 text-success" : "bg-[rgb(var(--c-surface-strong))] text-faint")}>
          {fileName ? <CheckCircle2 className="size-6" /> : icon}
        </span>
        <p className="mt-2 text-[13.5px] font-medium text-ink">
          {title}
          {required ? <span className="text-critical"> *</span> : null}
        </p>
        <p className="mt-0.5 text-[12px] text-muted">{hint}</p>
        {fileName ? (
          <p className="mt-2 text-[12px] font-medium text-success">{fileName}</p>
        ) : null}
        <Button variant={fileName ? "secondary" : "primary"} size="sm" className="mt-3" onClick={onUpload} icon={<Upload className="size-3.5" />}>
          {fileName ? "Replace file" : "Choose file"}
        </Button>
      </div>
      {error ? <p className="mt-1 text-[12px] text-critical">{error}</p> : null}
    </div>
  );
}

function ReviewBlock({ title, rows }: { title: string; rows: string[][] }) {
  return (
    <div className="rounded-compact bg-[rgb(var(--c-surface))] p-4">
      <p className="text-[11.5px] font-semibold uppercase tracking-[0.05em] text-muted">{title}</p>
      <dl className="mt-2 space-y-1">
        {rows.map(([k, v], i) => (
          <div key={i} className="flex justify-between gap-3 text-[13px]">
            <dt className="shrink-0 text-muted">{k}</dt>
            <dd className="truncate text-right text-ink">{v || "—"}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function StatusLine({ label, done, active }: { label: string; done?: boolean; active?: boolean }) {
  return (
    <div className="flex items-center gap-2.5 rounded-control bg-[rgb(var(--c-surface))] px-3.5 py-2.5">
      <span
        className={cn(
          "grid size-5 shrink-0 place-items-center rounded-full",
          done ? "bg-success text-white" : active ? "bg-warning text-white" : "bg-[rgb(var(--c-line-strong))]",
        )}
      >
        {done ? <CheckCircle2 className="size-3" /> : null}
      </span>
      <span className={cn("text-[12.5px]", done || active ? "text-ink" : "text-muted")}>{label}</span>
    </div>
  );
}
