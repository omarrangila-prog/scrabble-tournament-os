import {
  cardRows,
  type ConfirmationPlayer,
  divisionLabel,
  type EventFacts,
  moneyLines,
} from "./confirmation";

/**
 * The confirmation as an email and as a WhatsApp message.
 *
 * Grouped by contact, never by person. Three children on one parent's email get one message
 * carrying three cards — sending the same parent three near-identical emails is how a real
 * message gets ignored — but the registrations stay separate everywhere else.
 *
 * Certificates are not mentioned. They come after the tournament, from the results.
 */

export interface ContactGroup {
  /** Whoever the message is addressed to — the first registration on this contact. */
  lead: ConfirmationPlayer;
  players: ConfirmationPlayer[];
  confirmUrl: string;
}

/*
 * Two lines, not one.
 *
 * "Payment: Cash at Venue — PKR 1,250" reads to a tired parent as a receipt. The amount has
 * to carry its own label, because the whole difference between money paid and money owed
 * lives in that word.
 */
const moneyPair = (p: ConfirmationPlayer, bold: boolean) => {
  const m = moneyLines(p);
  const wrap = (t: string) => (bold ? `*${t}:*` : `${t}:`);
  return [`${wrap(m.label)} ${m.value}`, `${wrap(m.amountLabel)} ${m.amountValue}`];
};

export function confirmationSubject(group: ContactGroup, event: EventFacts): string {
  return group.players.length === 1
    ? `Please confirm ${group.players[0].name}'s registration — ${event.name}`
    : `Please confirm your ${group.players.length} registrations — ${event.name}`;
}

/* -------------------------------------------------------------------------- */
/* WhatsApp                                                                    */
/* -------------------------------------------------------------------------- */

const NUMERALS = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣"];

/**
 * WhatsApp, where bold is asterisks and nobody scrolls.
 *
 * Short enough to read in a notification: who, which category, what is owed or paid, when,
 * where, and one link.
 */
export function whatsappMessage(group: ContactGroup, event: EventFacts): string {
  const { players, confirmUrl } = group;
  const when = [
    `📅 ${event.date}`,
    `⏰ ${event.time}`,
    `📍 ${event.venue}`,
  ].join("\n");

  if (players.length === 1) {
    const p = players[0];
    return [
      `Hello ${p.name} 👋`,
      ``,
      `Your registration for *${event.name}* has been recorded.`,
      ``,
      `Please check your details:`,
      ``,
      `*Player #:* ${p.number}`,
      `*Name:* ${p.name}`,
      p.division ? `*Category:* ${divisionLabel(p.division)}` : "",
      ...moneyPair(p, true),
      ``,
      when,
      ``,
      `Please confirm here:`,
      confirmUrl,
      ``,
      `Keep your player number to hand for check-in.`,
      ``,
      `*${event.name}*`,
    ]
      .filter((line) => line !== "")
      .join("\n");
  }

  return [
    `Hello 👋`,
    ``,
    `${players.length} registrations are connected to your contact for *${event.name}*:`,
    ``,
    ...players.flatMap((p, i) => [
      `${NUMERALS[i] ?? `${i + 1}.`} *${p.name}*`,
      `Player #: ${p.number}`,
      p.division ? `Category: ${divisionLabel(p.division)}` : "",
      ...moneyPair(p, false),
      ``,
    ]),
    when,
    ``,
    `Please review and confirm all of them here:`,
    confirmUrl,
    ``,
    `*${event.name}*`,
  ]
    .filter((line, i, all) => !(line === "" && all[i - 1] === ""))
    .join("\n");
}

/* -------------------------------------------------------------------------- */
/* Email                                                                       */
/* -------------------------------------------------------------------------- */

const CREAM = "#F6F1E7";
const FOREST = "#2F5D3A";
const GOLD = "#C89B3C";
const BROWN = "#3E2F23";

const escape = (raw: string) =>
  raw.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function cardHtml(p: ConfirmationPlayer): string {
  const rows = cardRows(p)
    .filter((r) => r.label !== "Player Number" && r.label !== "Name")
    .map(
      (r) => `<tr>
        <td style="padding:7px 0;font-size:13px;color:${BROWN}A6;">${escape(r.label)}</td>
        <td style="padding:7px 0;font-size:14px;font-weight:600;color:${BROWN};text-align:right;">${escape(r.value)}</td>
      </tr>`,
    )
    .join("");

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
    style="margin:18px 0 0;border:2px solid ${GOLD}77;border-radius:14px;background:#FFFFFF;">
    <tr><td style="padding:16px 20px;background:${FOREST};border-radius:11px 11px 0 0;">
      <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;color:#FFFFFFCC;">Player ${escape(p.number)}</p>
      <p style="margin:3px 0 0;font-size:19px;font-weight:800;color:#FFFFFF;">${escape(p.name)}</p>
    </td></tr>
    <tr><td style="padding:6px 20px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table>
    </td></tr>
  </table>`;
}

export function confirmationEmail(group: ContactGroup, event: EventFacts): {
  subject: string;
  html: string;
  text: string;
} {
  const { players, confirmUrl, lead } = group;
  const many = players.length > 1;

  const html = `<div style="margin:0;padding:24px 12px;background:${CREAM};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <div style="max-width:520px;margin:0 auto;">
      <p style="margin:0;text-align:center;font-size:11px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:${GOLD};">${escape(event.name)}</p>
      <h1 style="margin:8px 0 0;text-align:center;font-size:22px;font-weight:800;color:${BROWN};">Player registration confirmation</h1>

      <p style="margin:20px 0 0;font-size:15px;color:${BROWN};">Dear ${escape(lead.name)},</p>
      <p style="margin:10px 0 0;font-size:14px;line-height:1.6;color:${BROWN}CC;">
        ${many
          ? `Your ${players.length} registrations for ${escape(event.name)} have been recorded. Please check each one below and confirm that it is correct.`
          : `Your registration for ${escape(event.name)} has been recorded. Please check the details below and confirm that they are correct.`}
      </p>

      ${players.map(cardHtml).join("")}

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0 0;border-radius:14px;background:${FOREST}14;">
        <tr><td style="padding:16px 20px;text-align:center;">
          <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;color:${GOLD};">Event details</p>
          <p style="margin:6px 0 0;font-size:15px;font-weight:700;color:${BROWN};">${event.date}</p>
          <p style="margin:2px 0 0;font-size:14px;color:${BROWN}CC;">${event.time}</p>
          <p style="margin:2px 0 0;font-size:13.5px;color:${BROWN}AA;">${event.venue}</p>
        </td></tr>
      </table>

      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:22px auto 0;">
        <tr><td style="border-radius:12px;background:${FOREST};">
          <a href="${escape(confirmUrl)}" style="display:inline-block;padding:15px 30px;font-size:15px;font-weight:700;color:#FFFFFF;text-decoration:none;">Confirm ${many ? "these details" : "my details"}</a>
        </td></tr>
      </table>
      <p style="margin:12px 0 0;text-align:center;font-size:13px;color:${BROWN}AA;">
        Something wrong? The same page has a <strong>Request a correction</strong> button.
      </p>

      <p style="margin:22px 0 0;font-size:13px;line-height:1.6;color:${BROWN}AA;">
        Please keep your player number to hand for check-in on the day. We look forward to
        welcoming you.
      </p>
      <p style="margin:14px 0 0;font-size:13px;font-weight:700;color:${BROWN};">${escape(event.name)}</p>
    </div>
  </div>`;

  const text = [
    `${event.name.toUpperCase()} — PLAYER REGISTRATION CONFIRMATION`,
    ``,
    `Dear ${lead.name},`,
    ``,
    many
      ? `Your ${players.length} registrations have been recorded. Please check each one.`
      : `Your registration has been recorded. Please check the details below.`,
    ``,
    ...players.flatMap((p) => [
      ...cardRows(p).map((r) => `${r.label}: ${r.value}`),
      ``,
    ]),
    `EVENT`,
    event.date,
    event.time,
    event.venue,
    ``,
    `Confirm your details, or ask for a correction:`,
    confirmUrl,
    ``,
    `Please keep your player number to hand for check-in.`,
    ``,
    event.name,
  ].join("\n");

  return { subject: confirmationSubject(group, event), html, text };
}

/**
 * One group per contact, in registration order.
 *
 * Email first, falling back to mobile, so a family that shares an address is one group even
 * when the children's phone numbers differ. Anybody with neither is their own group — they
 * still need a card, they just cannot be sent one.
 */
export function groupByContact(
  players: ConfirmationPlayer[],
  urlFor: (lead: ConfirmationPlayer) => string,
): ContactGroup[] {
  const groups = new Map<string, ConfirmationPlayer[]>();

  for (const p of players) {
    const email = p.email.trim().toLowerCase();
    const mobile = p.mobile.replace(/\D/g, "");
    const key = email !== "" ? `e:${email}` : mobile !== "" ? `m:${mobile}` : `p:${p.number}`;
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }

  return [...groups.values()].map((members) => ({
    lead: members[0],
    players: members,
    confirmUrl: urlFor(members[0]),
  }));
}
