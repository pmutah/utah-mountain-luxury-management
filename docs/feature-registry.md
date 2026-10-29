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
| Booking | Our own direct site, beside Hospitable Direct | sample | `/book` quotes season rates and emails a request. It does not charge or hold dates. Domain stays on Hospitable. |
| Guest | Trip portal, lock codes, upsells | planned | Stay app exists and is off per house. |
| Ops | Cleaner portal and photo inspection | planned | |
| Owner | Todd portal and statements | planned | Report tab already has the split. |
| AI | Agents hub | planned | Co-host, Muse, Amanda, and Nora already run. |
