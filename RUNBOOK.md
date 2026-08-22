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

**Everybody has a player number** — 101 upwards — and it is the only code anybody is
told. It appears on the confirmation page when they register, in their email, and on the
desk. A six-digit code still opens check-in for the handful who noted one before numbers
existed, but nothing asks for it any more.

A player number identifies but does not authorise: the first time it is used on a phone,
the last four digits of that person's mobile are asked for as well.

If somebody loses both, they can be found on the check-in page by mobile number and
surname, or looked up on the roster at **`/app/players`**.

### The day before: send everyone their number

Open **`/app/send-codes`** and press **Email all**. Everybody is told their player number,
what will be asked for at the door, and where to check in.

It sends one at a time and reports each outcome by name, so an address that bounces is
visible rather than buried in a total. WhatsApp is on the same screen — one tap per person,
the same message — for anybody whose email fails or who has no address.

Mail goes out from **Blufy's AlphaBattle <muhammadahmedrangila@gmail.com>** through Brevo,
which allows 300 a day on the free plan. Thirty-two entrants is well inside that.

---

## On the day

Almost none of this needs a laptop. You need a television, your phone, and the
participants' phones.

### Set up once, before people arrive

**Put the wall up.** Open **`/live/display`** on the television and leave it. It follows
the event by itself — check-in, then tables, then the clock, then results, then the
winner. Nobody touches it again.

**Set the tables — optional, and worth doing.** On **`/app/live-event`**, under **Table
plan**, say which tables each division sits at: `1-5` for Beginner, `6-12` for Recreational,
or a list like `1, 2, 3, 5, 7` if some tables do not exist. Pairing then seats people at the
numbers painted on the tables rather than at "board 1, 2, 3".

**Pairing works without it.** With no plan, boards are numbered from one in each division and
nothing is refused — so a plan that is wrong or missing cannot stop a round going out. Set it
if the tables in the room are numbered; skip it if they are not.

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

Set the phase to **Check-in Closed** first — pairing is only offered once check-in is
closed, so that a round cannot be built while people are still arriving.

Then **Pair and publish round 1** on Live Event. It pairs only the people who have actually
checked in, and seats them at their division's tables. If a division has more pairs than
tables it refuses and says so, rather than putting two games at one table. That check only
runs when a table plan is set; without one, boards are simply numbered from one.

### The one button

At the top of **`/app/live-event`**: **round length** — 20 or 25 minutes — and **rounds** —
4 or 5. Set them on the morning, once you have seen the room.

Then one press. It pairs the round if it needs pairing, starts the clock at the length you
chose, and moves every phone and the television onto it. The wall counts down from the
number set here; nothing else needs pressing.

**Finish after this one** ends the tournament at the round being played. Use it when the
afternoon has run long: once the last board is in, the event goes to final review instead of
pairing another round, and the standings, certificates and wall all agree it is over.

The choices are stored on the event, not in a browser, so the television and your phone can
never disagree about how long a round is.

### 3. The round

Set the phase to **Round Active** and the clock starts — on the wall and on every phone at
once, from the same recorded instant. **Add time** extends it everywhere.

**When the clock runs out the event moves itself to Result Entry.** The wall changes to the
result QR and every phone follows, without you pressing anything. Keep Live Event open on
your phone for that to happen — it is the screen watching the clock.

The wall shows the clock and nothing else. In the last minute it turns and pulses.

### One QR for the whole day

The wall carries a single code from the moment boards go up. It opens
**`/events/alphabattle-23-august/play`**, and that page is everything a participant needs:

- **Find yourself** by name — spelling does not have to be exact, "khan lodhi" finds
  *Rayyan hussain khan lodhi* — or by player number. Then the last four digits of your
  mobile, once, and the phone remembers you.
- **Your table, seat and opponent**, with a button per round.
- **Enter your result**, two numbers and nothing else.
- **Confirm or dispute** the score your opponent sent.
- **Your day so far**, every round with its score and result.

Nobody types anything personal on the television. The wall shows the code and the public
board list; who you are is settled on the phone in your hand.

When you publish the next round, everybody's page moves to it by itself within about
fifteen seconds. There is no new link to hand out.

Somebody who scans before checking in is offered **Check me in** on the same page — unless
their payment is unsettled, in which case it sends them to the desk.

### The song round

Drop the audio clips into **`public/songs/`** and list them in `manifest.json`:

```json
{ "clips": [ { "file": "song-1.mp3", "answer": "Pasoori" } ] }
```

When a round finishes the wall plays the next clip for twenty seconds, counts it down, and
then shows the answer. One clip per round, in order; it stops rather than looping. With no
clips the song round simply does not appear.

**Press "Tap once for sound" when you set the television up.** A browser will not play audio
until somebody has touched the page — one tap and it stays unlocked for the day.

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

### The day runs itself

At the top of Live Event there is a line saying what is about to happen. Once a round has
every result in, the next one is paired ten seconds later; once boards are up, the round
starts after thirty seconds so people can find their tables; when the clock runs out, the
event moves to result entry on its own.

Every automatic step is announced and counts down first, and **Not yet** stops that one
step. **Turn off** hands the whole day back to you and the controls below still work.

Two things stop it by themselves, which is what they are for: a **disputed board** is not
a verified result, so a disagreement halts the loop until you settle it; and a **break**
is a decision to stop, so nothing overrides one.

Keep Live Event open on your phone. It is the screen doing the watching.

### 5. Next round, and breaks

Wait until every board is in — the dashboard says so — then pair the next round.

**Start break** and **Start lunch break** both stop the room; they differ only in what the
wall says, and a room reads "lunch" very differently from "back shortly".

### 6. Finish

Set the phase to **Completed**. The wall counts out third place, then the runner-up, then
the champion, and leaves the podium up.

### 7. Final results, certificates and the emails

At the top of **`/app/live-event`** there is **Final results**. It shows the standings first —
top three in each division, ranked by wins then spread, the same order the wall uses — so the
names can be read out before anything is sent.

Then one button: **Issue and email all N certificates**. It gives every player a certificate
and emails it to them, one at a time, reporting each outcome by name.

**Every title is arithmetic, not a judgement.** Champion, Runner-up and Third place come from
the ranking. Beyond that each person gets the truest thing about their own day — highest score
of the day, biggest winning margin, best total spread, unbeaten, a winning record — and
everybody else is credited with the games they played. Ties keep every holder; nothing invents
a tiebreak to make a sentence read better.

Each email's subject is that person's own title, and the body carries their record: played,
won, lost, spread, and their best game with the opponent's name. A verification code that
anyone can check at **`/verify`** goes with it.

### 8. Certificates by hand

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

**Twenty-nine entrants were imported, not typed into the website.** Twenty-four came from
the Excel sheet and five from the entry form on 17 August. They behave exactly like a web
registration — they have player numbers, they pair, they appear in standings and certificates.
Do not ask them to register again. Two of them — Muhammad Yadaan and Abdul wasay Narinja —
also registered on the website; each is one record, not two.

Three of the five share one email address and two share a mobile: Hammad, Aariz hussain
solangi and Sakina Rameen are a family, and they are three separate entrants with three
player numbers. Nothing in the system merges people on a shared contact.

**Two of them submitted a name with something extra in it** — an "8AUG" tag and a "(free)"
note. Player numbers 138 and 139 are stored as *Raanya Fazil* and *Hania*, with the submitted
string kept on the record as `nameAsSupplied`. A wall display announcing which child is the
free one is a thing about her family's money said to a room.

**Eleven entrants cannot check themselves in**, because their payment is still being checked
and the phone will tell them to see the desk. That is deliberate, and the desk can admit any
of them in one tap. Expect them at the desk rather than at the QR:

> 108 Sehaan Owais · 110 Raamiz Ahmed · 113 Mohammed Hazil Sami · 114 Huzaifa Amir ·
> 115 Khizr Hussain Khan · 121 Khizrakhan · 138 Raanya Fazil · 139 Hania · 140 Hammad ·
> 141 Aariz hussain solangi · 142 Sakina Rameen

Five of those have an amount recorded and six have none, and the desk says which is which.
**"Check receipt · PKR 800" is not "Unpaid"** — that person says they have already paid and
their receipt has not been looked at, so taking cash from them takes it twice. **"No amount
set" means nothing has been agreed** with them at all.

**Money is shown in four separate figures, not one.** Paid online is the only one that is
revenue. Cash at venue is promised, not collected. Needs review is recorded but unconfirmed.
Unpaid / unknown covers anybody whose amount has never been established — which is not the
same as owing nothing. Press any tile on Payments to see just those people.

**A registration writes a receipt or a promise, never revenue.** Somebody choosing "pay cash
at the venue" is recorded as owing it, and only becomes revenue when the desk takes the
money.

**A receipt is a claim, not a payment.** It used to count as paid the moment it was
uploaded, until the receipts turned out never to have been stored: the form kept the file's
*name* and dropped the file, and there is no storage bucket, so "paid" rested on a piece of
text with no image behind it. Eleven entrants were counted as paid that way and some of them
had not paid. Uploading now records `receipt-uploaded`, which waits for a person.

**That means an uploaded receipt cannot check itself in.** Anybody whose payment is not
settled is sent to the desk, which is one tap — but it makes the desk the place the money is
decided, which is the point.

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
