#!/usr/bin/env python3
"""
Every participant's own links, and the number they are known by.

    scripts/export-player-links.py

One row per person: player number, name, contact, and the three addresses that belong to
them — the confirmation page, their personal check-in link, and the page they use on the day.

There is no username and no password anywhere in it. A participant is identified by a
three-digit number they can say out loud, and authorised by the last four digits of their own
mobile; the links carry an opaque token that resolves to a registration and exposes no
database id. Nothing here can be used to sign in to anything.

Written to `contacts/`, which is git-ignored: it holds real names, mobiles and addresses.
"""

from __future__ import annotations

import json
import pathlib
import re
import subprocess
import sys

import xlsxwriter

ROOT = pathlib.Path(__file__).resolve().parent.parent
EVENT_ID = "evt-alphabattle-23-august"
SLUG = "alphabattle-23-august"
SITE = "https://scrabble-tournament-os-fvbq.vercel.app"
OUT = ROOT / "contacts" / "alphabattle-23-august-player-links.xlsx"
TXT = ROOT / "contacts" / "alphabattle-23-august-player-links.txt"

QUERY = """
select coalesce(json_agg(json_build_object(
  'number', data->>'playerNumber',
  'name', btrim(data->>'fullName'),
  'mobile', coalesce(data->>'mobile',''),
  'email', coalesce(data->>'email',''),
  'division', coalesce(data->>'preferredDivision',''),
  'token', coalesce(data->>'token',''),
  'payment', coalesce(data->>'paymentStatus','')
) order by (data->>'playerNumber')::int), '[]')
from public.records
where collection = 'registrations' and event_id = '%s' and status = 'active'
""" % EVENT_ID

DIVISION = {"beginner": "Beginner", "recreational": "Recreational", "advanced": "Advanced"}


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
        capture_output=True,
        text=True,
    )
    if done.returncode != 0:
        sys.exit(f"psql failed:\n{done.stderr.strip()}")

    people = json.loads(done.stdout.strip() or "[]")
    if not people:
        sys.exit("No active registrations found.")

    missing = [p for p in people if not p["token"]]
    OUT.parent.mkdir(exist_ok=True)

    wb = xlsxwriter.Workbook(OUT)
    head = wb.add_format({"bold": True, "font_color": "#FFFFFF", "bg_color": "#2F5D3A",
                          "border": 1, "border_color": "#1F3F27", "valign": "vcenter",
                          "text_wrap": True})
    text = wb.add_format({"border": 1, "border_color": "#DDD6C8", "valign": "top"})
    # Text format, so Excel keeps the leading zero on a mobile and the shape of a number.
    plain = wb.add_format({"border": 1, "border_color": "#DDD6C8", "valign": "top",
                           "num_format": "@"})
    link = wb.add_format({"border": 1, "border_color": "#DDD6C8", "valign": "top",
                          "font_color": "#2F5D3A", "underline": 1})

    ws = wb.add_worksheet("Player links")
    cols = [
        ("Player #", 9, plain), ("Name", 26, text), ("Division", 13, text),
        ("Mobile", 15, plain), ("Email", 28, text),
        ("Confirm their details", 46, link),
        ("Their own check-in link", 46, link),
        ("On the day", 40, link),
    ]
    for i, (title, width, fmt) in enumerate(cols):
        ws.write(0, i, title, head)
        ws.set_column(i, i, width, fmt)
    ws.set_row(0, 30)
    ws.freeze_panes(1, 2)
    ws.autofilter(0, 0, len(people), len(cols) - 1)

    play = f"{SITE}/events/{SLUG}/play"

    for r, p in enumerate(people, start=1):
        confirm = f"{SITE}/events/{SLUG}/confirm/{p['token']}" if p["token"] else ""
        personal = f"{SITE}/r/{p['token']}" if p["token"] else ""

        ws.write_string(r, 0, p["number"] or "")
        ws.write_string(r, 1, p["name"] or "")
        ws.write_string(r, 2, DIVISION.get(p["division"], p["division"]))
        ws.write_string(r, 3, p["mobile"] or "")
        ws.write_string(r, 4, p["email"] or "")
        # A real hyperlink, so it can be clicked out of the sheet rather than copied by hand.
        if confirm:
            ws.write_url(r, 5, confirm, link, "Confirm details")
            ws.write_url(r, 6, personal, link, "Check in")
        else:
            ws.write_string(r, 5, "no link — token missing", text)
            ws.write_string(r, 6, "", text)
        ws.write_url(r, 7, play, link, "Player page")

    notes = wb.add_worksheet("How these work")
    notes.set_column(0, 0, 96, wb.add_format({"text_wrap": True, "valign": "top"}))
    for i, line in enumerate([
        "Blufy's AlphaBattle — 23 August 2026",
        "",
        "There is no username and no password for participants.",
        "",
        "A player is identified by their three-digit player number, which they can say out "
        "loud, and authorised by the last four digits of their own mobile. The links below "
        "carry an opaque token that resolves to one registration and exposes no database id.",
        "",
        "Confirm their details — the card showing what we hold about them, with Confirm and "
        "Request a correction. A family sharing an email sees one page with a card each, so "
        "any one of their links opens the whole family.",
        "",
        "Their own check-in link — opens their check-in on the day with nothing to type.",
        "",
        "On the day — the same page for everyone. It is behind the QR on the television: find "
        "yourself by name or number, see your table, enter your score, confirm your opponent's.",
        "",
        "Staff sign-in is separate and is not in this file. Two director accounts exist: "
        "mahmedrangila@gmail.com and admin@blufys.pk. Volunteers do not need an account — "
        "the desk runs from the director's own signed-in phone.",
    ]):
        notes.write_string(i, 0, line)

    wb.close()

    rows = [
        "Blufy's AlphaBattle — 23 August 2026",
        f"{len(people)} participants. No usernames or passwords — a player number and the "
        "last four digits of their mobile.",
        "",
    ]
    for p in people:
        rows.append(f"{p['number']}  {p['name']}")
        rows.append(f"      {p['mobile'] or 'no mobile'}   {p['email'] or 'no email'}")
        if p["token"]:
            rows.append(f"      confirm:  {SITE}/events/{SLUG}/confirm/{p['token']}")
            rows.append(f"      check-in: {SITE}/r/{p['token']}")
        else:
            rows.append("      no link — this registration has no token")
        rows.append("")
    TXT.write_text("\n".join(rows) + "\n", encoding="utf-8")

    print(f"{len(people)} participants -> {OUT.relative_to(ROOT)}")
    print(f"{len(people)} participants -> {TXT.relative_to(ROOT)}")
    if missing:
        print(f"WARNING: {len(missing)} have no token and therefore no personal link: "
              + ", ".join(f"{m['number']} {m['name']}" for m in missing))


if __name__ == "__main__":
    main()
