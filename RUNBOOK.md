# Running Blufy's AlphaBattle — 23 August 2026

Everything the director needs on the day, in the order it happens.

There is one account, and it belongs to the tournament director. Participants never
sign in, never install anything, and never enter a password.

---

## Before the day

### Sign in once, now

Open **`/organizer`** and sign in with the director's email address.

If the password does not work, reset it in Supabase under
**Authentication → Users → (the row) → Reset password**. There is no self-signup —
creating accounts from the sign-in form was removed, because a form that quietly
registers anyone who finds the URL is not a sign-in form. That means this is the only
door, so confirm it works before the day rather than on it.

**Change the password after the first sign-in.** The one currently set was typed into
a chat transcript.

### Share the registration link

```
/events/alphabattle-23-august/register
```

Registration writes straight to the database. A receipt screenshot is required — the
form will not submit without one.

**Everybody has a player number** — 101 upwards — which is what they use at the door.
The six-digit code still works for anyone who was given one, and the confirmation page
also offers a personal one-tap link.

A player number identifies but does not authorise: the first time it is used on a phone,
the last four digits of that person's mobile are asked for as well.

If somebody loses both, they can be found on the check-in page by mobile number and
surname, or looked up on the roster at **`/app/players`**.

---

## On the day

Almost none of this needs a laptop. You need a television, your phone, and the
participants' phones.

### Set up once, before people arrive

**Put the wall up.** Open **`/live/display`** on the television and leave it. It follows
the event by itself — check-in, then tables, then the clock, then results, then the
winner. Nobody touches it again.

**Set the tables.** On **`/app/live-event`**, under **Table plan**, say which tables each
division sits at: `1-5` for Beginner, `6-12` for Recreational, or a list like `1, 2, 3, 5,
7` if some tables do not exist. Pairing then seats people at the numbers painted on the
tables, not at "board 1, 2, 3".

The event **phase** decides what every phone and the wall show. Set it from
**`/app/live-event`**.

| Phase | Wall | A participant's phone |
| --- | --- | --- |
| `registration-open` | Scan to check in | Register now |
| `check-in-open` | Scan to check in, with the count | Check in |
| `round-published` | Round N — tables are up | Find your table |
| `round-active` | The clock, full screen | Find your board |
| `result-entry` | Submit your result, with a QR | Send your score |
| `break` | Break | Standings |
| `completed` | Third, runner-up, champion | Final results |

### 1. Check-in

Set the phase to **Check-in Open**. The wall shows a QR and a live count.

Everybody has a **player number** — 101, 102, 103. It is short enough to say across a
room and print on a badge. It identifies; it does not authorise. The first time somebody
uses it on their phone they also give the **last four digits of their mobile**, and after
that their phone remembers them for the rest of the day.

Three ways in, all equivalent:

- scan the wall, type their player number, confirm with their last four digits;
- their personal link, from the confirmation page — no typing at all;
- **the desk**: open **`/app/desk`** on your phone, search the number or name, press
  **Check in**.

Checking somebody in twice is safe. The second attempt keeps the original arrival time.

**Somebody paying cash** shows on the desk as *owes* an amount. Take the money, press
**Cash received**, then **Check in**. Both are one tap and both are reversible from
Payments.

Somebody who never registered: **Add walk-in** on `/app/players`.

### 2. Pair the round

**Pair and publish round 1** on Live Event. It pairs only the people who have actually
checked in, and seats them at their division's tables. If a division has more pairs than
tables it refuses and says so, rather than putting two games at one table.

### 3. The round

Set the phase to **Round Active** and the clock starts — on the wall and on every phone at
once, from the same recorded instant. **Add time** extends it everywhere.

The wall shows the clock and nothing else. In the last minute it turns and pulses.

### 4. Scores

When the round ends, the wall shows a QR: **submit your result**.

One player per board scans it. Their phone already knows who they are and which board they
are on, so they type two numbers and nothing else. **The score counts immediately** and the
standings move.

Their opponent then sees it on their own phone and can **confirm** or **say it is wrong**.
A disagreement sends the board to **Conflicts** and stops the round until you settle it —
the score is left alone, because a disagreement does not say which number is right.

You can still do everything from **`/app/score-entry`**: type a score, **Correct** one with
a reason, or **Dispute** a board yourself.

### 5. Next round, and breaks

Wait until every board is in — the dashboard says so — then pair the next round. **Start
break** puts a break on the wall.

### 6. Finish

Set the phase to **Completed**. The wall counts out third place, then the runner-up, then
the champion, and leaves the podium up.

### 7. Certificates

At **`/app/certificates`**: **Prepare from standings**, then **Issue**. Placement
certificates stay drafts until the phase is Final Review or Completed, so none can claim a
placing that is still open to change.

Anyone can check a certificate at **`/verify`** by typing its code or scanning its QR — no
account, on any phone.

**Withdraw** voids one and asks for a reason, which is what a checker is then shown.

---

## Screens

| Screen | What it is for |
| --- | --- |
| `/app` | The morning's summary and anything needing a decision |
| `/organizer/registrations` | Every entrant: who has paid, who has arrived |
| `/app/players` | The roster, walk-in entry, CSV export |
| `/app/desk` | The desk on a phone: find somebody, take cash, check them in |
| `/app/live-event` | Phase, table plan, arrivals, pairing, the round timer, venue QR |
| `/app/score-entry` | Scores |
| `/app/standings` | Standings, computed from verified games |
| `/app/payments` | Receipts and revenue |
| `/app/certificates` | Awards and certificates |
| `/report/<event id>` | The printable report for a sponsor — open it from **Analytics → Printable report** |
| `/live/display` | **The wall.** Follows the event by itself — put this on the television |
| `/live` | The rotating screen: standings, pairings, announcements |
| `/events/alphabattle-23-august/submit-score` | Where a player sends their result |
| `/live/alphabattle-23-august` | What a participant sees on their phone |

---

## Things worth knowing

**Standings are never stored.** They are computed from verified games every time they
are shown, so they cannot drift from the results. The same is true of arrival counts
and revenue.

**Twenty-four entrants came from the sheet.** They are marked "Legacy Excel Import" and
behave exactly like a web registration — they have check-in codes, they pair, they appear in
standings and certificates. Do not ask them to register again. Two of them — Muhammad Yadaan
and Abdul wasay Narinja — also registered on the website; each is one record, not two.

**Money is shown in four separate figures, not one.** Paid online is the only one that is
revenue. Cash at venue is promised, not collected. Needs review is recorded but unconfirmed.
Unpaid / unknown covers anybody whose amount has never been established — which is not the
same as owing nothing. Press any tile on Payments to see just those people.

**A registration writes a receipt or a promise, never revenue.** Somebody choosing "pay cash
at the venue" is recorded as owing it, and only becomes revenue when the desk takes the
money.

**A receipt counts as paid the moment it is uploaded.** This was chosen deliberately:
no receipt-checking work on the day, in exchange for revenue figures that include
money nobody has confirmed. The payments queue will therefore look empty. A receipt
can still be rejected afterwards, and the rejection records who decided.

**Nobody but the director can read the participant list.** Names and phone numbers are
not released to a browser that has not signed in, and that is enforced by the database
rather than by the app — so it holds even if somebody calls the API directly.

**A certificate is only as good as its code.** Issuing writes the certificate to the
database, and that record is what a scanned QR reads. If the studio ever reports that
issued certificates *cannot be verified*, they were issued before that record was
written — press **Publish** on the warning and the codes resolve again.

**If the internet drops**, the pages you already have open keep working and will catch
up when it returns. Scores entered while offline are not saved; re-enter them.

---

## Credentials

Anything that has been pasted into a chat, an email or a screenshot has to be treated as
public, whether or not anybody else actually saw it. Rotating is cheap; assuming is not.

**Rotate these:**

| Credential | Where | What breaks until it is replaced |
| --- | --- | --- |
| Resend API key | resend.com → API Keys → create, then delete the old one | Email. Update `RESEND_API_KEY` in Vercel and redeploy. |
| Database password | Supabase → Project Settings → Database → Reset password | `scripts/apply-migrations.sh` only. Update `SUPABASE_DB_URL` and `SUPABASE_DB_POOLER_URL` in `.env.local`. The app does not use it. |
| Firebase service-account keys | Firebase console → Project settings → Service accounts → delete the old keys | Nothing in this app — it runs on Supabase. Delete rather than replace. |

The publishable (anon) Supabase key is meant to be in the browser and does not need
rotating. What protects the data is row level security, not that key being secret.

**Before pushing**, run:

```
scripts/check-secrets.sh
```

It scans every tracked file *and the whole history* for keys, private keys and connection
strings, and exits non-zero if it finds one. Deleting a file does not remove a key from
history — the old commit still carries it — so a finding means rotate, not delete. To have
it run automatically:

```
ln -s ../../scripts/check-secrets.sh .git/hooks/pre-push
```

---

## If something looks wrong

**"This deployment has no database connection: NEXT_PUBLIC_… is not set."** The
hosting project is missing that environment variable. Add it in Vercel under
**Settings → Environment Variables**, then redeploy — Next.js reads `NEXT_PUBLIC_`
values at build time, so a redeploy is required and not optional.

Two variables are needed:

```
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_…
```

Either `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` or the older
`NEXT_PUBLIC_SUPABASE_ANON_KEY` works; newer Supabase projects give you the first.
Both are safe in a browser — the database enforces who may read what.

**A screen says "needs migration NNNN applied".** That migration has not been run.
Apply it with `scripts/apply-migrations.sh NNNN`, which needs `SUPABASE_DB_URL` in
`.env.local`.

**"Sign in to see the roster" when you are signed in.** The address is not on the staff
allowlist. Add it to `staff_allowlist` in Supabase; the account picks up access on
sign-up.

**A participant's phone still shows "Register now".** Check the phase in Live Event.
If it is right there, their phone is on an old page — pull to refresh.

**Nobody appears on the roster.** Check you are signed in as the director. An empty
list and a locked list look the same until the screen tells you which it is, and it
will tell you.
