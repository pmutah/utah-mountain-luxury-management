# Feature registry

Status words: `sample` (built on stand-in data), `live` (uses real accounts), `planned`.

Existing expenses, bookings, receipts, and construction records stay in Cloudflare KV. New market data will go in D1 (`web/migrations/0001_market.sql`) and is not wired to production yet.

| Area | Feature | Status | Notes |
| --- | --- | --- | --- |
| Data safety | KV backup and integrity baseline | live | Private folder outside the repo. Re-run `uml-data-backups/backup-kv.mjs`. |
| Market | Top 10 comps per house | sample | Replaced by AirROI when a key exists. |
| Market | 90-day rate band and percentile | sample | Gold line is our ask. Band is open comps. |
| Market | Shadow rate moves, 8% cap, holiday lock, floors | sample | Does not write Airbnb, VRBO, or Hospitable. |
| Market | Hospitable calendar push | planned | After 7 days of shadow mode and a write token. |
| Booking | Our own direct site, beside Hospitable Direct | sample | `/book` shows a month of nightly prices, refuses booked nights, and emails a request. It does not charge or hold dates. |
| Guest | Trip portal, lock codes, upsells | planned | Stay app exists and is off per house. |
| Ops | Cleaner desk for the next two weeks | sample | `#/clean` lists turnovers and a room checklist. Checks stay in the browser. It does not create or delete tasks, bookings, or expenses. |
| Owner | Todd portal and statements | sample | `#/owner` is a read-only Ranch and River statement after the 20% fee. Lindon, household, and construction stay off that page. |
| AI | Agents hub | sample | `#/agents` opens Co-host and Build and lists the shared jobs. It does not claim a job or change the books. |
