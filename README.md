# Bandas cambiarias BCRA

Static page that charts the official wholesale dollar (BCRA Com. A 3500) against
the BCRA exchange-rate band (floor/ceiling, $/USD), from one month before the band
started (2025-04-14, the day the cepo was lifted) to today, plus a six-month
projection of the dollar and its monthly trend next to the latest monthly inflation.

## Data

Everything is fetched live from BCRA on each visit; there is no bundled snapshot.

- Band: `api/bandas.js` (a Vercel function, no dependencies) returns the whole series.
  - 2026 onwards: BCRA xlsx
    (https://www.bcra.gob.ar/archivos/Pdfs/PublicacionesEstadisticas/serie-completa-bandas-cambiarias.xlsx).
    BCRA serves it without CORS headers, so the function downloads and parses it.
  - 2025: computed from the official rule (start $1.000 / $1.400, -1% / +1% per
    month compounded over calendar days); matches the published 31/12/2025 ceiling of $1.526,60.
  - Vercel's CDN caches the result for an hour.
- Dollar: BCRA API variable 5 (https://api.bcra.gob.ar/estadisticas/v4.0/Monetarias/5),
  fetched directly by the browser (CORS is open).
- Inflation: BCRA API variable 27 (monthly CPI, %), fetched the same way. Optional:
  if it fails, only the inflation bar stays empty.

If the band or the dollar can't be loaded, the page shows an error instead of the chart.

## Projection

Computed in the browser on every load. The trend is a log-linear regression on the
post-cepo quotes; the projection starts at the last quote and the 80% range widens
with the daily volatility times the square root of the trading days ahead.

## Files

- `index.html` – page (Chart.js from cdnjs, Archivo from Google Fonts, no build step)
- `api/bandas.js` – Vercel function: band series (computed 2025 + BCRA xlsx) as JSON

## Run locally

```sh
npx vercel dev
```

A plain static server doesn't work: the page needs `/api/bandas`.

## Deploy to Vercel

No config needed (framework preset "Other"; `api/` is picked up automatically).

```sh
npx vercel        # preview
npx vercel --prod # production
```
