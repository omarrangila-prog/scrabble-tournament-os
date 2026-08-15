#!/usr/bin/env python3
"""
Put the 21 people who registered for 23 August before the website existed into the database,
with the payment information the organizer has since supplied.

They registered on an Excel sheet. The point of the import is that afterwards they are
indistinguishable from a web registration everywhere — roster, check-in desk, pairing,
standings, certificates all read one record shape, so an imported entrant missing a field
simply vanishes from whichever screen needs it.

    scripts/import-legacy-registrations.py            # says what it would do, writes nothing
    scripts/import-legacy-registrations.py --commit   # writes

The dry run is the default on purpose: this puts real people into a live event days before
the day.

Four rules the data forces, each of which a careless import gets wrong:

1.  Every row is a different person. Several children share a parent's email and phone, and
    two rows differ only by a trailing surname ("Mohammed Hazil" and "Mohammed Hazil Sami").
    Nothing here deduplicates on contact details.

2.  Somebody on the sheet has since registered on the website. Matching is therefore by name
    *and* phone against what is already stored, and a match is updated rather than inserted —
    otherwise the one person who did as they were asked ends up in the list twice.

3.  Money is not invented. A row with no amount stays with no amount, and is reported as
    needing review rather than as zero — "PKR 0" and "we do not know yet" are different
    facts, and only one of them is true.

4.  Cash promised at the venue is not revenue. It is recorded against its own payment state
    so the dashboard can separate what has arrived from what has been promised.

Re-running is safe: each person carries an `importKey`, and a second run updates rather than
inserts.
"""

from __future__ import annotations

import argparse
import json
import pathlib
import random
import re
import subprocess
import sys

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent
PEOPLE_FILE = HERE / "legacy-registrations-23-august.json"
PAYMENTS_FILE = HERE / "legacy-payments-23-august.json"

EVENT_ID = "evt-alphabattle-23-august"
ORG_ID = "org-federation"

# The Excel categories, and the divisions this event actually runs.
DIVISION_FOR = {
    "New to the game/Beginner": "beginner",
    "Intermediate/Recreational": "recreational",
    "Regular/Advanced": "advanced",
}

# The organizer's payment vocabulary, and the states the application already understands.
#
# `verified` is the only one the revenue figure counts, which is what keeps cash promised at
# the venue and amounts still under review out of it.
PAYMENT_STATE = {
    "Online": ("verified", "Online", True),
    "Cash on Site": ("cash-at-venue", "Cash at Venue", False),
    "Needs Review": ("review-required", None, False),
    "Promo / Complimentary": ("complimentary", "Promotion", True),
}


def connection() -> str:
    """The pooler URL from .env.local — the direct database host is IPv6-only."""
    env = ROOT / ".env.local"
    if not env.exists():
        sys.exit("No .env.local found.")

    text = env.read_text()
    for key in ("SUPABASE_DB_POOLER_URL", "SUPABASE_DB_URL"):
        found = re.search(rf'^{key}="?([^"\n]+)"?$', text, re.M)
        if found:
            return found.group(1)
    sys.exit("No database URL in .env.local (SUPABASE_DB_POOLER_URL).")


def psql(url: str, sql: str) -> str:
    """Run SQL, and fail loudly rather than half-way."""
    done = subprocess.run(
        ["psql", url, "-v", "ON_ERROR_STOP=1", "--no-psqlrc", "-tA", "-c", sql],
        capture_output=True,
        text=True,
    )
    if done.returncode != 0:
        sys.exit(f"psql failed:\n{done.stderr.strip()}")
    return done.stdout.strip()


def digits(raw: str) -> str:
    """
    A phone number as digits only.

    The sheet has the same number written three ways — "0321 2586691", "0323 2877434",
    "0345-9266647". Comparing the raw strings would treat one person as two.
    """
    return re.sub(r"\D", "", raw or "")


def name_key(raw: str) -> str:
    """
    A name reduced to what identifies the person.

    Case folded and inner whitespace collapsed, because the website stored one of these
    people as "Muhammad Yadaan " with a trailing space and exact comparison therefore missed
    him — which would have inserted a second copy of the one person who did register online.

    Deliberately not fuzzy beyond that. "Mohammed Hazil" and "Mohammed Hazil Sami" differ by
    a whole word and must stay two different people, so no substring or prefix matching.
    """
    return " ".join(raw.split()).casefold()


def karachi_iso(stamp: str) -> str:
    """
    An Excel timestamp as an instant.

    The sheet was filled in in Karachi, so its wall-clock times are +05:00. Reading them as
    UTC would move every registration five hours earlier and reorder the ones taken minutes
    apart — which is exactly the ordering the organizer recognises.
    """
    return f"{stamp.replace(' ', 'T')}+05:00"


def token(rng: random.SystemRandom) -> str:
    """
    The token in somebody's personal check-in link.

    Twelve characters from an unambiguous alphabet, the same length the web form issues. It
    opens that person's own check-in, so it comes from the system's random source rather than
    from the seeded generator used for display codes.
    """
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "".join(rng.choice(alphabet) for _ in range(12))


def check_in_codes(taken: set[str], count: int) -> list[str]:
    """
    Six-digit codes nobody at this event already holds.

    There is a unique index on (event_id, check_in_code), so a clash would fail the insert.
    Codes already in use are read first, and each new one joins the set as it is drawn so two
    imported rows cannot clash with each other either.
    """
    rng = random.Random(20260823)
    codes: list[str] = []
    while len(codes) < count:
        code = str(rng.randrange(100_000, 1_000_000))
        if code in taken:
            continue
        taken.add(code)
        codes.append(code)
    return codes


def payment_fields(pay: dict) -> dict:
    """
    One person's money, in both vocabularies.

    The application's own `paymentStatus` and `amountDue` drive every existing screen; the
    organizer's words are kept beside them so nothing is reinterpreted or lost. An amount of
    `null` stays `null` — the distinction between "nothing owed" and "not yet known" is the
    whole reason this import exists.
    """
    label = pay["paymentStatus"]
    if label not in PAYMENT_STATE:
        sys.exit(f"Unknown payment status {label!r} for {pay['name']!r}")

    status, method, verified = PAYMENT_STATE[label]
    amount = pay["amount"]

    return {
        "paymentStatus": status,
        "amountDue": amount,
        "paymentMethod": method,
        "payment": {
            "pricingType": pay["promo"],
            "amountPaidOrDue": amount,
            "paymentStatus": label,
            "paymentMethod": method,
            "paymentVerified": verified,
            "paymentNote": (
                "Historical registration imported from Excel"
                if amount is None
                else f"{pay['promo']} — {label}, from the organizer's payment sheet"
            ),
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--commit", action="store_true", help="actually write to the database")
    args = parser.parse_args()

    people = json.loads(PEOPLE_FILE.read_text())
    payments = json.loads(PAYMENTS_FILE.read_text())
    url = connection()

    if len(people) != len(payments):
        sys.exit(
            f"{len(people)} people on the sheet but {len(payments)} payment rows — "
            "every entrant needs a row, even one that says the amount is not known yet."
        )

    # Payments are matched on name and phone together, so the two Hazils stay two people.
    by_person = {(name_key(p["name"]), digits(p["phone"])): p for p in payments}
    if len(by_person) != len(payments):
        sys.exit("Two payment rows share a name and phone — cannot tell them apart.")

    # What is already stored, so somebody who has since used the website is updated, not
    # duplicated.
    existing_rows = psql(
        url,
        """
        select coalesce(json_agg(json_build_object(
          'id', id,
          'name', data->>'fullName',
          'phone', data->>'mobile',
          'code', check_in_code
        )), '[]')
        from public.records
        where collection = 'registrations' and event_id = '%s' and status = 'active'
        """
        % EVENT_ID,
    )
    existing = json.loads(existing_rows)
    by_existing = {(name_key(r["name"] or ""), digits(r["phone"] or "")): r for r in existing}
    taken_codes = {r["code"] for r in existing if r["code"]}

    codes = check_in_codes(taken_codes, len(people))
    secrets = random.SystemRandom()

    inserts: list[str] = []
    updates: list[str] = []
    report: list[tuple[str, str, str]] = []

    for i, person in enumerate(people):
        original = person["originalSkillLevel"]
        division = DIVISION_FOR.get(original)
        if division is None:
            sys.exit(f"Unmapped skill level {original!r} for {person['fullName']!r}")

        key = (name_key(person["fullName"]), digits(person["phone"]))
        pay = by_person.get(key)
        if pay is None:
            sys.exit(f"No payment row for {person['fullName']!r} on {person['phone']!r}")

        money = payment_fields(pay)
        submitted = karachi_iso(person["originalTimestamp"])
        import_key = f"legacy:{person['originalTimestamp']}:{person['email'].lower()}"

        import_block = {
            "registrationSource": "Legacy Excel Import",
            "importKey": import_key,
            "originalTimestamp": person["originalTimestamp"],
            "age": person["age"],
            "phone": person["phone"],
            "playsPSARankingTournaments": person["playsPSARankingTournaments"],
            "originalSkillLevel": original,
            "skillLevel": division.capitalize(),
            "heardAboutEvent": person["heardAboutEvent"],
            "mediaConsent": person["mediaConsent"],
            "cancellationAgreement": person["cancellationAgreement"],
            "refundAgreement": person["refundAgreement"],
            "eventRulesAgreement": person["eventRulesAgreement"],
            **money["payment"],
        }

        match = by_existing.get(key)

        if match:
            # Already registered through the website. Their own submission stands; only the
            # promo and payment facts the organizer supplied are written over it.
            patch = {
                "paymentStatus": money["paymentStatus"],
                "amountDue": money["amountDue"],
                "import": import_block,
            }
            if money["paymentMethod"]:
                patch["paymentMethod"] = money["paymentMethod"]

            updates.append(
                "update public.records set data = data || %s::jsonb, updated_at = now() "
                "where id = %s;"
                % (sql_literal(json.dumps(patch)), sql_literal(match["id"]))
            )
            report.append((person["fullName"], "matched existing website registration", pay["promo"]))
            continue

        data = {
            "id": f"reg-legacy-{i + 1:02d}",
            "eventId": EVENT_ID,
            "fullName": person["fullName"],
            "email": person["email"],
            "mobile": digits(person["phone"]),
            "status": "submitted",
            "submittedAt": submitted,
            "preferredDivision": division,
            "currency": "PKR",
            "checkInCode": codes[i],
            "token": token(secrets),
            "paymentStatus": money["paymentStatus"],
            "amountDue": money["amountDue"],
            # One track runs at this event, so this is a fact about the event rather than a
            # guess about the person. Without it they drop out of the report's track figures.
            "participationTrack": "speed_scrabble",
            "answers": {},
            "timeline": [
                {
                    "at": submitted,
                    "by": "Legacy Excel Import",
                    "entry": "Registered on the 23 August sheet, before the website existed.",
                }
            ],
            "import": import_block,
        }
        if money["paymentMethod"]:
            data["paymentMethod"] = money["paymentMethod"]

        inserts.append(
            "insert into public.records "
            "(collection, organization_id, event_id, data, status, check_in_code, created_at) "
            "select 'registrations', %s, %s, %s::jsonb, 'active', %s, %s::timestamptz "
            "where not exists (select 1 from public.records where collection = 'registrations' "
            "and data->'import'->>'importKey' = %s);"
            % (
                sql_literal(ORG_ID),
                sql_literal(EVENT_ID),
                sql_literal(json.dumps(data)),
                sql_literal(codes[i]),
                sql_literal(submitted),
                sql_literal(import_key),
            )
        )
        report.append((person["fullName"], f"import as {division}", pay["promo"]))

    print(f"{len(inserts)} to insert, {len(updates)} to update\n")
    for name, what, promo in report:
        print(f"  {name:<30} {what:<40} {promo}")

    if not args.commit:
        print("\nDry run. Nothing written. Re-run with --commit.")
        return

    script = "begin;\n" + "\n".join(inserts + updates) + "\ncommit;"
    (ROOT / ".import.sql").write_text(script)
    done = subprocess.run(
        ["psql", url, "-v", "ON_ERROR_STOP=1", "--no-psqlrc", "-f", str(ROOT / ".import.sql")],
        capture_output=True,
        text=True,
    )
    (ROOT / ".import.sql").unlink(missing_ok=True)

    if done.returncode != 0:
        sys.exit(f"import failed, nothing committed:\n{done.stderr.strip()}")

    print("\nWritten.")


def sql_literal(value: str) -> str:
    """A single-quoted SQL literal. Doubling the quote is the escape Postgres wants."""
    return "'" + value.replace("'", "''") + "'"


if __name__ == "__main__":
    main()
