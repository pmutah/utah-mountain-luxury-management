# Elite rebuild log

## 2026-10-29 — backup and Market tab

- Exported all 392 production KV keys to a private folder outside the repo. Baseline: 413 expenses, 70 bookings, receipt and construction files included. Nothing in Cloudflare was written or deleted.
- Branch `elite-rebuild`. The live site on `main` is unchanged.
- New `#/market` screen: top 10 sample comps per house, a 90-day rate band, and shadow rate moves. Raises are capped at 8% a day, holiday rates stay locked, and the base is not cut. No prices are sent to Airbnb, VRBO, or Hospitable.
- Checked in the browser: Market renders, Our expenses still lists the household ledger, and Overview still shows Ranch, Lindon, and River bookings.
- Still sample data. Live comps need an AirROI key. Live rate changes need a Hospitable write token and a week of shadow mode.
