"""Match the official result names to registrations, and say how sure each match is.

TSH shortens names — "Muhammad Ashar Narinja" is filed as "Ashar Narinja" — so this cannot
be an equality check. It also must not be a guess: an email carrying somebody's results to
the wrong person is worse than an email nobody sends.

So every match is scored, and only a match that is unambiguous is treated as certain. Where
two registrations fit equally well, or where the best fit is weak, the row is left for a
person to decide rather than resolved by the closest guess.
"""
import json, re, unicodedata, pathlib
from collections import defaultdict

def words(name):
    plain = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    return [w for w in re.split(r"[^a-z0-9]+", plain.lower()) if w]

DROP = {"muhammad", "mohammad", "mohammed", "md", "syed", "syeda", "mr", "ms"}

def core(name):
    """The distinguishing words, with the honorifics half this roster carries dropped."""
    ws = words(name)
    kept = [w for w in ws if w not in DROP]
    return kept or ws

roster = []
for line in pathlib.Path("roster.tsv").read_text().splitlines():
    parts = line.split("\t")
    if len(parts) < 4 or not parts[0].strip():
        continue
    roster.append({"name": parts[0].strip(), "email": parts[1].strip(),
                   "division": parts[2].strip(), "number": parts[3].strip()})

results = json.loads(pathlib.Path("/home/synthor/Desktop/Scrabble Management OS/src/data/alphabattleResults.json").read_text())

def score(a_name, a_div, r):
    a, b = set(core(a_name)), set(core(r["name"]))
    if not a or not b:
        return 0
    shared = a & b
    if not shared:
        return 0
    # How much of the shorter name is accounted for by the longer one.
    coverage = len(shared) / min(len(a), len(b))
    points = coverage * 100
    if a == b:
        points += 40
    if a_div.lower() == r["division"].lower():
        points += 12
    # A single shared common word is weak evidence on its own.
    if len(shared) == 1 and len(a) > 1 and len(b) > 1:
        points -= 25
    return points

rows, certain, unsure = [], [], []
used = defaultdict(list)

for division in results["divisions"]:
    for player in division["players"]:
        ranked = sorted(
            ((score(player["name"], division["name"], r), r) for r in roster),
            key=lambda t: -t[0],
        )
        best, second = ranked[0], (ranked[1] if len(ranked) > 1 else (0, None))
        row = {"name": player["name"], "division": division["name"], "slug": player["slug"],
               "best": best[1]["name"] if best[0] > 0 else None,
               "email": best[1]["email"] if best[0] > 0 else "",
               "number": best[1]["number"] if best[0] > 0 else "",
               "score": round(best[0], 1), "runnerUp": round(second[0], 1),
               "runnerUpName": second[1]["name"] if second[1] else None}
        confident = best[0] >= 100 and best[0] - second[0] >= 20 and row["email"]
        row["confident"] = bool(confident)
        rows.append(row)
        (certain if confident else unsure).append(row)
        if confident:
            used[row["email"]].append(row["name"])


# A shared address is normal here: parents registered whole families on one email, so
# three Sohails legitimately share one. What is not normal is two result names resolving to
# the same registration — that means one of them is matched to the wrong person.
by_record = defaultdict(list)
for row in certain:
    by_record[(row["best"], row["number"])].append(row["name"])
clashes = {k: v for k, v in by_record.items() if len(v) > 1}
for row in certain[:]:
    if (row["best"], row["number"]) in clashes:
        row["confident"] = False
        row["reason"] = "two players matched the same registration"
        certain.remove(row)
        unsure.append(row)

pathlib.Path("matches.json").write_text(json.dumps(rows, indent=2, ensure_ascii=False))
print(f"players: {len(rows)}   confident: {len(certain)}   needs a human: {len(unsure)}")
print(f"registrations claimed twice: {len(clashes)}")
print("\n--- not matched confidently ---")
for row in sorted(unsure, key=lambda r: (r["division"], r["name"])):
    why = row.get("reason") or ("no email on file" if row["best"] and not row["email"]
                                else "no clear match" if row["score"] < 100
                                else f"too close to {row['runnerUpName']}")
    print(f"  {row['division']:<13} {row['name']:<22} -> {str(row['best']):<28} {why}")
