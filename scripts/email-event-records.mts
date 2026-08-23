/**
 * Sends every player their results page and certificate.
 *
 * Two things make this worth a script rather than a screen. The official results carry
 * shortened names — TSH files "Muhammad Ashar Narinja" as "Ashar Narinja" — so each result
 * has to be matched back to a registration before anybody can be written to. And a send to
 * a real participant list is not undoable, so it happens once, deliberately, with the list
 * printed first.
 *
 * Nothing sends without `--live`. The default is a dry run that prints exactly who would be
 * written to and what the subject line says.
 *
 * A match is only used when it is unambiguous: the best candidate has to clear a score and
 * beat the runner-up by a margin, and no two results may resolve to the same registration.
 * Everything else is printed for a person to decide. An email carrying somebody's results to
 * the wrong person is worse than an email nobody sends.
 *
 * Usage:
 *   npx tsx scripts/email-event-records.ts                 # dry run, prints the list
 *   npx tsx scripts/email-event-records.ts --only a@b.test # one address, really sends
 *   npx tsx scripts/email-event-records.ts --live          # sends to everybody matched
 */

import { readFileSync } from "node:fs";
import path from "node:path";

/*
 * Read .env.local here rather than pulling in a loader for four lines. The provider key
 * must be in the environment before the sender module is imported, which is why the
 * imports below are dynamic.
 */
for (const line of readFileSync(path.join(process.cwd(), ".env.local"), "utf8").split("\n")) {
  const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
  if (!match) continue;
  process.env[match[1]] ??= match[2].replace(/^["']|["']$/g, "");
}

/* Imported after the environment is loaded: the sender reads its key at call time. */
const { sendEmail, provider } = await import("../src/lib/email/send");
const { eventRecordEmail } = await import("../src/lib/email/templates");
const { EVENT, formatRecord, ordinal, withSign } = await import(
  "../src/lib/domain/eventRecord"
);

const SITE = "https://scrabble-tournament-os-fvbq.vercel.app";

interface Match {
  name: string;
  division: string;
  slug: string;
  best: string | null;
  email: string;
  number: string;
  confident: boolean;
}

const matches: Match[] = JSON.parse(
  readFileSync(process.env.MATCHES ?? "scripts/data/record-email-matches.json", "utf8"),
);

const live = process.argv.includes("--live");
const only = process.argv[process.argv.indexOf("--only") + 1];
const single = process.argv.includes("--only") ? only : null;

function playerFor(slug: string) {
  for (const division of EVENT.divisions) {
    const player = division.players.find((p) => p.slug === slug);
    if (player) return { player, division };
  }
  return null;
}

const sendable = matches.filter((m) => m.confident && m.email);
const held = matches.filter((m) => !(m.confident && m.email));

console.log(`provider: ${provider()}`);
console.log(`matched and sendable: ${sendable.length}`);
console.log(`held back for a human: ${held.length}`);
if (!live && !single) {
  console.log("\nDRY RUN — nothing will be sent. Add --live to send.\n");
}

let sent = 0;
const failures: string[] = [];

for (const match of sendable) {
  if (single && match.email.toLowerCase() !== single.toLowerCase()) continue;

  const found = playerFor(match.slug);
  if (!found) {
    failures.push(`${match.name}: no player for slug ${match.slug}`);
    continue;
  }

  const { player, division } = found;
  const ranked = division.players.filter((p) => p.ranked).length;
  const mail = eventRecordEmail({
    fullName: match.best ?? player.name,
    division: division.name,
    position: player.ranked ? `${ordinal(player.rank!)} of ${ranked}` : null,
    record: formatRecord(player),
    spread: withSign(player.spread),
    recordUrl: `${SITE}/results/${player.slug}`,
  });

  if (!live && !single) {
    console.log(`  would send to ${match.email.padEnd(34)} ${match.best} — ${mail.subject}`);
    continue;
  }

  const result = await sendEmail({ to: match.email, ...mail });
  if (result.ok) {
    sent++;
    console.log(`  sent  ${match.email.padEnd(34)} ${match.best}`);
  } else {
    failures.push(`${match.email}: ${result.reason} — ${result.message}`);
    console.log(`  FAIL  ${match.email.padEnd(34)} ${result.reason} — ${result.message}`);
  }

  /* Gentle on the provider, and slow enough that a mistake is noticed before it is 43 wide. */
  await new Promise((resolve) => setTimeout(resolve, 400));
}

if (live || single) console.log(`\nsent: ${sent}`);
if (failures.length > 0) {
  console.log(`\nfailures (${failures.length}):`);
  for (const line of failures) console.log("  " + line);
}

if (held.length > 0) {
  console.log(`\nheld back — these need a person to say who they are:`);
  for (const m of held) {
    console.log(
      `  ${m.division.padEnd(13)} ${m.name.padEnd(22)} -> ${String(m.best ?? "no candidate").padEnd(28)}` +
        `${m.email ? "" : " (no email on file)"}`,
    );
  }
}
