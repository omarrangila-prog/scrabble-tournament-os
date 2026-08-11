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

**Tell people to save their six-digit code before closing the confirmation page.**
No email is sent, and that page is the only copy. They can also copy a personal
one-tap check-in link from it.

If somebody loses both, they can be found on the check-in page by mobile number and
surname, or looked up on the roster at **`/app/players`**.

---

## On the day

The event **phase** decides what every participant's phone shows. It is stored in the
database, so changing it on your laptop changes every phone within a second or two.
Set it from **`/app/live-event`**.

| Phase | What a participant sees |
| --- | --- |
| `registration-open` | Register now |
| `check-in-open` | Check in |
| `round-published` / `round-active` | Find your board |
| `result-entry` | Find your board, plus "take your slip to the desk" |
| `break` / `final-review` | Standings |
| `completed` | Final results |

### 1. Open check-in

Set the phase to **Check-in Open**.

Participants check themselves in three ways, all equivalent:

- their personal link, from the confirmation page;
- the venue QR code, then their six-digit code;
- the desk: find them on the arrival list in **Live Event** and press **Check in**.

Checking somebody in twice is safe. The second attempt says they are already in and
keeps the original arrival time.

Somebody who never registered: **Add walk-in** on **`/app/players`**. It records them,
marks them arrived, and gives you a code to write on their badge. Their payment is
recorded as unpaid.

### 2. Pair the first round

In **Live Event**, press **Pair and publish round 1**.

It pairs only the people who have actually checked in, using a Swiss fold that avoids
repeat opponents. The whole round is published at once, so nobody sees half a round.
Boards appear on every phone and on the venue screen immediately.

### 3. Enter scores

**`/app/score-entry`** — search a board number or a name, type both scores, Save.

A score lands on every other screen in about a second and a half, so a second laptop
can enter scores at the same time without either of you refreshing.

- An unusual total is flagged, not blocked.
- **Correct** requires a reason, which is stored with the result against your name.
- **Undo** reopens a board entered against the wrong game.
- **Dispute** holds a board that the players disagree about. The score stays as it is and
  nothing is deleted; the board reads *disputed*, Live Event counts it under Conflicts,
  and the round will not advance until it is settled. A reason is required, because
  somebody else may have to settle it.
- A dispute ends when a person re-enters the score through **Correct**. There is no
  "resolve" button: the only way a score becomes official is that someone puts their name
  to it.

### 4. Next round

Wait until every board has a score — the dashboard says so — then **Pair and publish
round 2**. A round that already has results cannot be re-paired by accident; clearing
it is a separate, explicit action that says what it will delete.

### 5. Finish

Set the phase to **Completed**. Standings are at **`/app/standings`** and on the venue
screen at **`/live`**.

### 6. Certificates

At **`/app/certificates`**: **Prepare from standings** writes a certificate for every
player from the verified results. Each is a draft — nothing is public yet — and each
carries a line about that person taken from their own games.

Placement certificates stay drafts until the event reaches **Final review** or
**Completed**, so none can claim a placing that is still open to change. Change the
phase on `/app/live-event` when the results are settled, then **Issue**.

Issuing is the moment the code printed on a certificate starts to resolve. Anyone can
check one at **`/verify`**, by typing the code or scanning the QR on the back — no
account, on any phone.

**Withdraw** voids one and asks for a reason, which is what a checker is then shown.

---

## Screens

| Screen | What it is for |
| --- | --- |
| `/app` | The morning's summary and anything needing a decision |
| `/organizer/registrations` | Every entrant: who has paid, who has arrived |
| `/app/players` | The roster, walk-in entry, CSV export |
| `/app/live-event` | Phase, arrivals, pairing, the round timer, venue QR |
| `/app/score-entry` | Scores |
| `/app/standings` | Standings, computed from verified games |
| `/app/payments` | Receipts and revenue |
| `/app/certificates` | Awards and certificates |
| `/report/<event id>` | The printable report for a sponsor — open it from **Analytics → Printable report** |
| `/live` | The big screen for the wall |
| `/live/alphabattle-23-august` | What a participant sees on their phone |

---

## Things worth knowing

**Standings are never stored.** They are computed from verified games every time they
are shown, so they cannot drift from the results. The same is true of arrival counts
and revenue.

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
