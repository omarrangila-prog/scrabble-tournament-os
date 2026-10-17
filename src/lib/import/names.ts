/**
 * Comparing names without deciding that two people are one.
 *
 * Two levels, kept apart on purpose. `nameKey` removes only what never changes who somebody is —
 * capitals, accents, spacing, punctuation — so two spellings that differ in nothing else are
 * the same key and may be matched automatically. Anything less certain than that (a different
 * word order, a missing surname, a typo) is a *likely* match, which a person confirms. Merging
 * two players on resemblance alone would put one person's score on another's record, and no
 * score is worth that.
 */

/** "  Ahmed  KHAN. " → "ahmed khan". */
export function nameKey(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[.,'’`"“”()[\]_/\\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** The words of a name, order ignored — so "Khan Ahmed" and "Ahmed Khan" compare equal. */
export function nameTokens(name: string): string[] {
  return nameKey(name).split(" ").filter(Boolean);
}

/** "(3-0 +214)" or "[1450]" after a name is the source's decoration, not part of the name. */
export function cleanName(raw: string): string {
  return raw
    .replace(/\s*[([][^)\]]*[)\]]\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Edit distance, capped: anything beyond `limit` is just "far", and we stop counting. */
export function editDistance(a: string, b: string, limit = 3): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > limit) return limit + 1;

  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
      current.push(value);
      if (value < rowMin) rowMin = value;
    }
    if (rowMin > limit) return limit + 1;
    previous = current;
  }
  return previous[b.length];
}

/** Whether every word of the shorter name appears in the longer one. */
export function isTokenSubset(a: string[], b: string[]): boolean {
  const [small, large] = a.length <= b.length ? [a, b] : [b, a];
  return small.length > 0 && small.every((t) => large.includes(t));
}
