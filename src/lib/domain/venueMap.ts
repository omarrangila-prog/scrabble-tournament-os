/**
 * The embeddable map for a venue.
 *
 * The registration form printed a venue name and, once it had a link, opened Maps in a new
 * tab. Both ask somebody to already know where the place is, or to leave the form to find
 * out. A picture of the street answers it without going anywhere, which matters most on the
 * phone where nearly every registration is filled in.
 *
 * Coordinates first, because they are exact. An address is a search, and a search for a cafe
 * on a road with several businesses can land on any of them — this venue's own share link
 * resolves to a pin Google labels as the training centre next door, which is precisely the
 * ambiguity a coordinate removes.
 *
 * No API key, deliberately. Google's keyed Embed API is the documented route and would mean
 * a billing account, a key in the environment, and a map that goes blank the day the key is
 * rotated or the quota is hit. The keyless embed is what a shared map link already uses.
 *
 * A blank iframe is a possible outcome — Google can change this endpoint, a network can
 * block it — so the caller must keep the address and the Maps link beside the map rather
 * than making the map the only way to find the venue.
 */

/** `lat,lng`, with optional spaces, within the ranges the Earth actually has. */
const COORDS = /^\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/;

export function parseCoords(value: string | undefined): string | null {
  const match = COORDS.exec(value ?? "");
  if (!match) return null;

  const lat = Number(match[1]);
  const lng = Number(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;

  return `${lat},${lng}`;
}

/**
 * The `src` for a venue map, or null when there is nothing to show.
 *
 * Null rather than a map of the wrong place: an event with no coordinates and no address
 * has nothing to point at, and a map centred on a country is worse than no map at all.
 */
export function venueMapSrc(input: {
  coords?: string;
  venueName?: string;
  address?: string;
  city?: string;
}): string | null {
  const coords = parseCoords(input.coords);
  if (coords) {
    return `https://www.google.com/maps?q=${encodeURIComponent(coords)}&z=17&output=embed`;
  }

  /* Falls back to a search, so an event whose director pasted no coordinates still shows
     roughly the right street. Named parts only — an empty address must not become a query
     for the venue name alone, which finds a branch in another city. */
  const query = [input.venueName, input.address, input.city]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(", ");

  if (!query || !input.address?.trim()) return null;

  return `https://www.google.com/maps?q=${encodeURIComponent(query)}&z=16&output=embed`;
}

/**
 * The address as one line, without saying the city twice.
 *
 * `venueAddress` is free text a director types, and the natural thing to type is a full
 * address ending in the city — which is also held separately, so joining the two produced
 * "Block 6, Razi Rd, P.E.C.H.S., Karachi, Karachi" under the map.
 */
export function venueLine(address?: string, city?: string): string {
  const street = address?.trim() ?? "";
  const town = city?.trim() ?? "";

  if (!street) return town;
  if (!town) return street;

  /* Case-insensitive, and only at the end — a street named after the city stays. */
  const alreadyEnds = street.toLowerCase().endsWith(town.toLowerCase());
  return alreadyEnds ? street : `${street}, ${town}`;
}
