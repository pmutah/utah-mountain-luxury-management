# Feature registry

Status words: `sample` (built on stand-in data), `live` (uses real accounts), `planned`.

Existing expenses, bookings, receipts, and construction records stay in Cloudflare KV. New market data will go in D1 (`web/migrations/0001_market.sql`) and is not wired to production yet.

| Area | Feature | Status | Notes |
| --- | --- | --- | --- |
| Data safety | KV backup and integrity baseline | live | Private folder outside the repo. Re-run `uml-data-backups/backup-kv.mjs`. |
| Market | Top 10 comps per house | sample | Pin and hide are saved in this browser. A hidden comp is replaced from the bench. Live comps replace the samples when a key exists. |
| Market | 90-day rate band and percentile | sample | Gold line is our ask. Band is open comps. | 
| Market | Next 30, 60, and 90 nights | sample | Our booked share uses the live calendar. The comp share is still the sample set. | 
| Market | What-if nightly ask | sample | A typed ask is judged against the floor, the ceiling, and the 8% cap. It does not change the published rate. |
| Market | Shadow rate moves, 8% cap, holiday lock, floors | sample | Does not write Airbnb, VRBO, or Hospitable. |
| Market | Daily shadow run | sample | One text covers River, Ranch, and Lindon. Booked, closed, and paused nights stay at the published rate. Promotions follow the fill rules. The text is shown and not sent. |
| Market | Hospitable calendar push | planned | After 7 days of shadow mode and a write token. |
| Booking | Our own direct site, beside Hospitable Direct | sample | `/book` quotes the host net, applies the 20% fill rate when the year is short, and emails a request. It does not charge or hold dates. |
| Guest | Trip portal, lock codes, upsells | sample | The stay app shows the trip steps. An early arrival is offered only when the night before is open, and the door code still waits until the day before. The app stays off until it is turned on for that house. |
| Ops | Cleaner desk for the next two weeks | sample | `#/clean` lists turnovers and a room checklist. Checks stay in the browser. It does not create or delete tasks, bookings, or expenses. |
| Owner | Todd portal and statements | sample | `#/owner` is a read-only Ranch and River statement after the 20% fee. Lindon, household, and construction stay off that page. |
| AI | Agents hub | sample | `#/agents` opens Co-host and Build and lists the shared jobs. It does not claim a job or change the books. |
