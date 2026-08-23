#!/usr/bin/env python3
"""
The cash list: everybody who still owes money, for the person on the tin.

    scripts/export-cash-list.py

One row per person, in player-number order, with a blank column to tick as each one pays.
A .xlsx rather than a CSV so Excel keeps the leading zero on every mobile.

Written to `contacts/`, which is git-ignored: it holds real names and mobiles.
"""

from __future__ import annotations

import datetime
import json
import pathlib
import re
import subprocess
import sys

import xlsxwriter

ROOT = pathlib.Path(__file__).resolve().parent.parent
EVENT_ID = "evt-alphabattle-23-august"
OUT = ROOT / "contacts" / "alphabattle-23-august-cash-to-collect.xlsx"

DIVISION = {"beginner": "Beginner", "recreational": "Recreational", "advanced": "Advanced"}

QUERY = """
select coalesce(json_agg(json_build_object(
  'number', data->>'playerNumber',
  'name', btrim(data->>'fullName'),
  'mobile', coalesce(data->>'mobile',''),
  'division', coalesce(data->>'preferredDivision',''),
  'amount', data->>'amountDue',
  'note', coalesce(data->>'paymentNote','')
) order by (data->>'playerNumber')::int), '[]')
from public.records
where collection = 'registrations' and event_id = '%s' and status = 'active'
  and coalesce(data->>'paymentStatus','') not in ('verified', 'complimentary')
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


def main() -> None:
    done = subprocess.run(
        ["psql", connection(), "-v", "ON_ERROR_STOP=1", "--no-psqlrc", "-tA", "-c", QUERY],
        capture_output=True, text=True,
    )
    if done.returncode != 0:
        sys.exit(f"psql failed:\n{done.stderr.strip()}")

    people = json.loads(done.stdout.strip() or "[]")
    OUT.parent.mkdir(exist_ok=True)

    wb = xlsxwriter.Workbook(OUT)
    head = wb.add_format({"bold": True, "font_color": "#FFFFFF", "bg_color": "#2F5D3A",
                          "border": 1, "border_color": "#1F3F27", "valign": "vcenter",
                          "text_wrap": True})
    text = wb.add_format({"border": 1, "border_color": "#DDD6C8", "valign": "top"})
    # Text, so Excel keeps the leading zero on a mobile.
    plain = wb.add_format({"border": 1, "border_color": "#DDD6C8", "valign": "top",
                           "num_format": "@"})
    money = wb.add_format({"border": 1, "border_color": "#DDD6C8", "valign": "top",
                           "num_format": '#,##0;-#,##0;"—"'})
    total = wb.add_format({"bold": True, "border": 1, "border_color": "#1F3F27",
                           "bg_color": "#F2EDE1", "num_format": "#,##0"})
    tick = wb.add_format({"border": 1, "border_color": "#DDD6C8", "align": "center"})

    ws = wb.add_worksheet("Cash to collect")
    cols = [("Player #", 9, plain), ("Name", 28, text), ("Mobile", 15, plain),
            ("Division", 14, text), ("Amount (PKR)", 13, money), ("Paid ✓", 10, tick)]
    for i, (title, width, fmt) in enumerate(cols):
        ws.write(0, i, title, head)
        ws.set_column(i, i, width, fmt)
    ws.set_row(0, 28)
    ws.freeze_panes(1, 0)
    ws.autofilter(0, 0, len(people), len(cols) - 1)

    owed = 0.0
    for r, p in enumerate(people, start=1):
        ws.write_string(r, 0, p["number"] or "")
        ws.write_string(r, 1, p["name"] or "")
        ws.write_string(r, 2, p["mobile"] or "")
        ws.write_string(r, 3, DIVISION.get(p["division"], p["division"]))
        if p["amount"] in (None, ""):
            # Blank, never zero: nobody has agreed a figure with this person yet.
            ws.write_blank(r, 4, None, money)
        else:
            ws.write_number(r, 4, float(p["amount"]), money)
            owed += float(p["amount"])
        ws.write_string(r, 5, "", tick)

    row = len(people) + 1
    ws.write_string(row, 3, "Total to collect", total)
    ws.write_number(row, 4, owed, total)

    wb.close()
    print(f"{len(people)} people owing PKR {owed:,.0f} -> {OUT.relative_to(ROOT)}")
    print(f"exported {datetime.datetime.now().strftime('%d %b %Y %H:%M')}")


if __name__ == "__main__":
    main()
