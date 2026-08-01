# Pakistan Scrabble Association — branding

## Swapping in the official logo file

The association mark is currently drawn as vector artwork matching the supplied
design (gold-bordered green diamond, P/S/A tiles, name around the edge). To use
the official image file instead:

1. Save the logo into `public/` as **`psa-logo.png`** (SVG also works — update
   the path constant if so).
2. Open `src/components/brand/PsaLogo.tsx` and set:

   ```ts
   const USE_SUPPLIED_ASSET = true;
   ```

That is the only change required. Every placement across the product reads from
this one component, so the new artwork appears everywhere at once.

## Where the logo appears

| Surface | Variant | Size |
|---|---|---|
| Login / welcome panel | `stacked` | 72 |
| Landing top navigation | `mark` + plate | 44 |
| Sidebar (desktop) | `mark` + plate | 40 |
| Sidebar (mobile drawer) | `lockup` + plate | 38 |
| Public championship site header | `mark` + plate | 40 |
| TV / broadcast header | `mark` + plate | 56 |
| Registration landing | `mark` | 36 |
| Digital player card | `mark` + plate | 34 |
| Digital result slip | `mark` | 34 |
| Reports — document header | via `PsaDocumentHeader` | 56 |
| Certificates | `mark` | 68 |

`plate` renders a white glass backing behind the mark, used where the
background is coloured or busy so the logo keeps its contrast.

## Rules the component enforces

- Proportions are locked — the mark is always square and never stretched.
- Colours are fixed in `PSA_BRAND` and never recoloured per surface.
- Clear space is built into each placement via the surrounding flex gap.
- The logo appears once per screen; no repetition within a single view.

## Document headers

Reports, certificates, result slips and pairing sheets use `PsaDocumentHeader`,
which prints:

```
Pakistan Scrabble Association
OFFICIAL TOURNAMENT REPORT   (or OFFICIAL CERTIFICATE)
```

Print styles strip glass and shadows so these render cleanly on paper and in
exported PDFs.
