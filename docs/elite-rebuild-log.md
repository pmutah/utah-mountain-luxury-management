# Elite rebuild log

## 2026-10-29 — backup and Market tab

- Exported all 392 production KV keys to a private folder outside the repo. Baseline: 413 expenses, 70 bookings, receipt and construction files included. Nothing in Cloudflare was written or deleted.
- Branch `elite-rebuild`. The live site on `main` is unchanged.
- New `#/market` screen: top 10 sample comps per house, a 90-day rate band, and shadow rate moves. Raises are capped at 8% a day, holiday rates stay locked, and the base is not cut. No prices are sent to Airbnb, VRBO, or Hospitable.
- Checked in the browser: Market renders, Our expenses still lists the household ledger, and Overview still shows Ranch, Lindon, and River bookings.
- Still sample data. Live comps need an AirROI key. Live rate changes need a Hospitable write token and a week of shadow mode.

## 2026-10-29 — Today desk and booking quote

- Overview opens with the next seven days: pace rings, arrivals, departures, and open nights, all from the bookings already on the books.
- `/book` shows a guest quote from the same season rates as the market board, plus the existing cleaning fee. Sending still emails a request. No card, no calendar hold, no change to expenses or bookings.

## 2026-10-29 — booked nights and turnovers

- The stay quote refuses a night that is already reserved or blocked. Cancelled stays stay open. The public availability route returns dates only.
- `/book` shows the month with a guest price on each open night. Booked nights are marked and cannot start a stay.
- Overview lists turnovers for the next two weeks: same-day clean, or how many nights sit before the next arrival.

## 2026-10-29 — owner statement

- `#/owner` shows Todd’s share of Ranch and River, using the same split as the report. It does not list Lindon, household purchases, or construction, and it has no edit or delete controls.
