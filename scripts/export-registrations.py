#!/usr/bin/env python3
"""
The registration list as a real spreadsheet.

    scripts/export-registrations.py            # writes contacts/…-registrations.xlsx

A .xlsx rather than a CSV, because the two things that go wrong with a CSV of this data both
go wrong silently on somebody else's machine: Excel reads 03222927461 as a number and hands
back 3222927461, losing a digit from every mobile in the event, and it decodes the file in the
local codepage, turning "sharimkizoja123°" into mojibake. A workbook carries the types and the
encoding with it.

The file lands in `contacts/`, which is git-ignored — it holds seventy real names, mobiles and
email addresses, and this repository is public.
"""

from __future__ import annotations

import datetime
import json
import pathlib
import re
import subprocess
import sys

import xlsxwriter

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent
EVENT_ID = "evt-alphabattle-23-august"
OUT = ROOT / "contacts" / "alphabattle-23-august-registrations.xlsx"

PAYMENT = {
    "verified": "Paid — confirmed",
    "cash-at-venue": "Cash at venue — owed",
    "review-required": "Needs review",
    "receipt-uploaded": "Receipt not checked",
    "complimentary": "Complimentary",
}
DIVISION = {"beginner": "Beginner", "recreational": "Recreational", "advanced": "Advanced"}

QUERY = """
select coalesce(json_agg(json_build_object(
  'number', data->>'playerNumber',
  'name', btrim(data->>'fullName'),
  'nameAsSupplied', coalesce(data->'import'->>'nameAsSupplied',''),
  'age', coalesce(data->'import'->>'ageAsSupplied', data->'import'->>'age', ''),
  'mobile', coalesce(data->>'mobile',''),
  'email', coalesce(data->>'email',''),
  'division', coalesce(data->>'preferredDivision',''),
  'psa', coalesce(data->'import'->>'playsPSARankingTournaments',''),
  'paymentStatus', coalesce(data->>'paymentStatus',''),
  'amount', data->>'amountDue',
  'paymentNote', coalesce(data->>'paymentNote',''),
  'source', coalesce(data->'import'->>'registrationSource','Website'),
  'city', coalesce(data->>'city',''),
  'area', coalesce(data->'answers'->>'area',''),
  'heard', coalesce(data->'import'->>'heardAboutEvent',''),
  'mediaConsent', coalesce(data->'import'->>'mediaConsent',''),
  'submitted', coalesce(data->>'submittedAt', created_at::text),
  'checkInCode', coalesce(check_in_code,''),
  'checkedIn', case when checked_in_at is null then '' else checked_in_at::text end
) order by (data->>'playerNumber')::int), '[]')
from public.records
where collection = 'registrations' and event_id = '%s' and status = 'active'
""" % EVENT_ID


def connection() -> str:
    env = ROOT / ".env.local"
    if not env.exists():
        sys.exit("No .env.local found.")
    text = env.read_text()
    for key in ("SUPABASE_DB_POOLER_URL", "SUPABASE_DB_URL"):
        found = re.search(rf'^{key}="?([^"\n]+)"?$', text, re.M)
        if found:
            return found.group(1)
    sys.exit("No database URL in .env.local.")


def karachi(raw: str) -> str:
    """The instant as a Karachi wall clock — the one the organizer recognises."""
    if not raw:
        return ""
    try:
        t = datetime.datetime.fromisoformat(raw.replace("Z", "+00:00"))
        if t.tzinfo is None:
            t = t.replace(tzinfo=datetime.timezone.utc)
        return t.astimezone(datetime.timezone(datetime.timedelta(hours=5))).strftime(
            "%d %b %Y %H:%M"
        )
    except ValueError:
        return raw


def main() -> None:
    done = subprocess.run(
        ["psql", connection(), "-v", "ON_ERROR_STOP=1", "--no-psqlrc", "-tA", "-c", QUERY],
        capture_output=True,
        text=True,
    )
    if done.returncode != 0:
        sys.exit(f"psql failed:\n{done.stderr.strip()}")

    people = json.loads(done.stdout.strip() or "[]")
    if not people:
        sys.exit("No active registrations found.")

    OUT.parent.mkdir(exist_ok=True)
    wb = xlsxwriter.Workbook(OUT)

    head = wb.add_format({"bold": True, "font_color": "#FFFFFF", "bg_color": "#2F5D3A",
                          "border": 1, "border_color": "#1F3F27", "valign": "vcenter",
                          "text_wrap": True})
    text = wb.add_format({"border": 1, "border_color": "#DDD6C8", "valign": "top"})
    # Text format, so Excel keeps the leading zero instead of turning
    # 03222927461 into 3222927461.
    plain = wb.add_format({"border": 1, "border_color": "#DDD6C8", "valign": "top",
                           "num_format": "@"})
    money = wb.add_format({"border": 1, "border_color": "#DDD6C8", "valign": "top",
                           "num_format": '#,##0;-#,##0;"—"'})
    wrap = wb.add_format({"border": 1, "border_color": "#DDD6C8", "valign": "top",
                          "text_wrap": True})

    ws = wb.add_worksheet("Registrations")
    cols = [
        ("Player #", 9, plain), ("Full name", 26, text), ("Age", 7, text),
        ("Mobile", 15, plain), ("Email", 30, text), ("Division", 14, text),
        ("PSA player", 10, text), ("Payment", 20, text), ("Amount (PKR)", 13, money),
        ("Payment note", 34, wrap), ("Source", 20, text), ("Registered (PKT)", 18, text),
        ("Checked in", 18, text), ("City / area", 20, text), ("Heard about it", 22, wrap),
        ("Media consent", 13, text), ("Check-in code", 13, plain),
        ("Name as submitted", 22, text),
    ]
    for i, (title, width, fmt) in enumerate(cols):
        ws.write(0, i, title, head)
        ws.set_column(i, i, width, fmt)
    ws.set_row(0, 30)
    ws.freeze_panes(1, 2)
    ws.autofilter(0, 0, len(people), len(cols) - 1)

    for r, p in enumerate(people, start=1):
        ws.write_string(r, 0, p["number"] or "")
        ws.write_string(r, 1, p["name"] or "")
        ws.write_string(r, 2, p["age"] or "")
        ws.write_string(r, 3, p["mobile"] or "")
        ws.write_string(r, 4, p["email"] or "")
        ws.write_string(r, 5, DIVISION.get(p["division"], p["division"]))
        ws.write_string(r, 6, p["psa"] or "")
        ws.write_string(r, 7, PAYMENT.get(p["paymentStatus"], p["paymentStatus"]))
        # Blank where no amount has ever been established. Zero would be a claim.
        if p["amount"] in (None, ""):
            ws.write_blank(r, 8, None, money)
        else:
            ws.write_number(r, 8, float(p["amount"]), money)
        ws.write_string(r, 9, p["paymentNote"] or "")
        ws.write_string(r, 10, p["source"] or "")
        ws.write_string(r, 11, karachi(p["submitted"]))
        ws.write_string(r, 12, karachi(p["checkedIn"]))
        ws.write_string(r, 13, ", ".join(x for x in [p["city"], p["area"]] if x))
        ws.write_string(r, 14, p["heard"] or "")
        ws.write_string(r, 15, p["mediaConsent"] or "")
        ws.write_string(r, 16, p["checkInCode"] or "")
        ws.write_string(r, 17, p["nameAsSupplied"] or "")

    s = wb.add_worksheet("Summary")
    s.set_column(0, 0, 30, text)
    s.set_column(1, 1, 12, text)
    s.set_column(2, 2, 16, money)
    s.write(0, 0, "Blufy's AlphaBattle — 23 August 2026",
            wb.add_format({"bold": True, "font_size": 14, "font_color": "#2F5D3A"}))
    s.write_string(1, 0, f"{len(people)} entrants · exported "
                         f"{datetime.datetime.now().strftime('%d %b %Y %H:%M')}")

    row = 3
    for heading, key, names in [
        ("By division", "division", DIVISION),
        ("By payment", "paymentStatus", PAYMENT),
        ("By source", "source", {}),
    ]:
        s.write(row, 0, heading, head)
        s.write(row, 1, "People", head)
        s.write(row, 2, "PKR on file", head)
        row += 1
        seen: dict[str, tuple[int, float]] = {}
        for p in people:
            k = p[key] or "—"
            amount = float(p["amount"]) if p["amount"] not in (None, "") else 0.0
            count, total = seen.get(k, (0, 0.0))
            seen[k] = (count + 1, total + amount)
        for k, (count, total) in sorted(seen.items(), key=lambda kv: -kv[1][0]):
            s.write_string(row, 0, names.get(k, k))
            s.write_number(row, 1, count, text)
            s.write_number(row, 2, total, money)
            row += 1
        row += 1

    wb.close()
    print(f"{len(people)} registrations -> {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
