#!/usr/bin/env python3
"""
The round's boards as a spreadsheet, one sheet per category.

    scripts/export-pairings.py [round]

Printed for the wall or the table ends: table number, both players and their player numbers,
with a blank column for the score. Byes are listed separately, because a bye is not a table
and printing one sends somebody to sit opposite nobody.

Written to `contacts/`, which is git-ignored: it carries real names.
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


def psql(url: str, sql: str) -> str:
    done = subprocess.run(
        ["psql", url, "-v", "ON_ERROR_STOP=1", "--no-psqlrc", "-tA", "-c", sql],
        capture_output=True, text=True,
    )
    if done.returncode != 0:
        sys.exit(f"psql failed:\n{done.stderr.strip()}")
    return done.stdout.strip()


def main() -> None:
    rnd = int(sys.argv[1]) if len(sys.argv) > 1 else 0
    url = connection()

    if rnd == 0:
        rnd = int(psql(url, f"select coalesce(max(round),0) from public.games where event_id='{EVENT_ID}'") or 0)
    if rnd == 0:
        sys.exit("No round has been paired yet.")

    boards = json.loads(psql(url, f"""
        select coalesce(json_agg(json_build_object(
          'division', g.division,
          'board', g.board,
          'a_no', a.data->>'playerNumber',
          'a_name', btrim(a.data->>'fullName'),
          'b_no', b.data->>'playerNumber',
          'b_name', btrim(b.data->>'fullName'),
          'bye', g.player_b is null
        ) order by g.division, g.board), '[]')
        from public.games g
        join public.records a on a.id = g.player_a
        left join public.records b on b.id = g.player_b
        where g.event_id = '{EVENT_ID}' and g.round = {rnd}
    """) or "[]")

    plan = json.loads(psql(url, f"""
        select coalesce(data->'tablePlan', '[]'::jsonb) from public.events where id='{EVENT_ID}'
    """) or "[]")
    allowed = {p["division"]: set(p.get("tables") or []) for p in plan}

    out = ROOT / "contacts" / f"alphabattle-round-{rnd}-pairings.xlsx"
    out.parent.mkdir(exist_ok=True)
    wb = xlsxwriter.Workbook(out)

    head = wb.add_format({"bold": True, "font_color": "#FFFFFF", "bg_color": "#2F5D3A",
                          "border": 1, "border_color": "#1F3F27", "valign": "vcenter"})
    big = wb.add_format({"bold": True, "font_size": 14, "border": 1,
                         "border_color": "#DDD6C8", "align": "center", "valign": "vcenter"})
    text = wb.add_format({"border": 1, "border_color": "#DDD6C8", "valign": "vcenter",
                          "font_size": 12})
    num = wb.add_format({"border": 1, "border_color": "#DDD6C8", "valign": "vcenter",
                         "num_format": "@", "align": "center"})
    blank = wb.add_format({"border": 1, "border_color": "#DDD6C8"})
    warn = wb.add_format({"border": 1, "border_color": "#B4442F", "font_color": "#B4442F",
                          "bold": True, "align": "center", "valign": "vcenter", "font_size": 14})
    note = wb.add_format({"italic": True, "font_color": "#8A6A1F"})

    off_plan = []

    for key, label in DIVISION.items():
        rows = [b for b in boards if b["division"] == key and not b["bye"]]
        byes = [b for b in boards if b["division"] == key and b["bye"]]
        if not rows and not byes:
            continue

        ws = wb.add_worksheet(label)
        for i, (title, width) in enumerate(
            [("Table", 9), ("Player", 30), ("#", 7), ("Player", 30), ("#", 7), ("Score", 14)]
        ):
            ws.write(0, i, title, head)
            ws.set_column(i, i, width)
        ws.set_row(0, 26)
        ws.freeze_panes(1, 0)

        r = 1
        for b in rows:
            ok = not allowed.get(key) or b["board"] in allowed[key]
            if not ok:
                off_plan.append(f"{label} table {b['board']}")
            ws.set_row(r, 24)
            ws.write_number(r, 0, b["board"], big if ok else warn)
            ws.write_string(r, 1, b["a_name"] or "", text)
            ws.write_string(r, 2, b["a_no"] or "", num)
            ws.write_string(r, 3, b["b_name"] or "", text)
            ws.write_string(r, 4, b["b_no"] or "", num)
            ws.write_blank(r, 5, None, blank)
            r += 1

        if byes:
            r += 1
            ws.write_string(r, 0, "Bye — no game this round", note)
            r += 1
            for b in byes:
                ws.set_row(r, 22)
                ws.write_string(r, 0, "—", big)
                ws.write_string(r, 1, b["a_name"] or "", text)
                ws.write_string(r, 2, b["a_no"] or "", num)
                r += 1

    s = wb.add_worksheet("Summary")
    s.set_column(0, 0, 78)
    s.write_string(0, 0, f"Blufy's AlphaBattle — round {rnd} boards")
    s.write_string(1, 0, f"exported {datetime.datetime.now().strftime('%d %b %Y %H:%M')}")
    line = 3
    for key, label in DIVISION.items():
        games = len([b for b in boards if b["division"] == key and not b["bye"]])
        byes = len([b for b in boards if b["division"] == key and b["bye"]])
        tables = sorted(allowed.get(key) or [])
        span = f"{tables[0]}–{tables[-1]}" if tables else "no plan set"
        s.write_string(line, 0, f"{label}: {games} boards, {byes} bye(s). Tables set aside: {span}")
        line += 1

    if off_plan:
        line += 1
        s.write_string(line, 0, "Outside the table plan, shown in red: " + ", ".join(off_plan))

    wb.close()
    print(f"round {rnd}: {len(boards)} boards -> {out.relative_to(ROOT)}")
    if off_plan:
        print("WARNING — outside the table plan: " + ", ".join(off_plan))


if __name__ == "__main__":
    main()
