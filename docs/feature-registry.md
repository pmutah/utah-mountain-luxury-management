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
| Market | Listing opportunities | sample | Titles are on our booking page. A lone weekend night waits until the last week. Photos and card payment stay open. Nothing posts to Airbnb or VRBO. |
| Market | Shadow rate moves, 8% cap, holiday lock, floors | sample | Does not write Airbnb, VRBO, or Hospitable. |
| Market | Daily shadow run | sample | One text covers River, Ranch, and Lindon. Booked, closed, and paused nights stay at the published rate. Promotions follow the fill rules. Each finished Denver day is saved on this browser, up to seven. The text is shown and not sent. |
| Market | Hospitable calendar push | planned | Seven saved shadow days and a write token are both required. The write stays closed. |
| Booking | Our own direct site, beside Hospitable Direct | sample | `/book` quotes the host net night by night, shows the published house (sleeps, arrival, parking, nearby), and applies the 20% fill rate when the year is short. A party larger than the house is refused. The request stays off until the guest count fits and the rules are read. It does not charge, hold dates, or sign the stay agreement. |
| Guest | Trip portal, lock codes, upsells | sample | The stay app shows the trip steps, an add-on menu, and a checkout list the guest can check off. The door code stays hidden until the guest reads the house rules on that phone. Those taps stay on the phone and do not sign the stay agreement or change the reservation. Early arrival and late checkout appear only when that night is open. The app stays off until it is turned on for that house. |
| Ops | Cleaner desk for the next two weeks | sample | `#/clean` lists turnovers in English or Spanish. The photo line stays open until a room photo is attached in this tab. A fix note stays in this browser and shows on the agents brief. Checks and notes do not create a task or change a booking or an expense. |
| Owner | Todd portal and statements | sample | `#/owner` is a read-only Ranch and River statement after the 20% fee. Year to date lists each month, and those lines add up to Todd’s share. Print makes a paper copy. Lindon, household, and construction stay off that page. |
| AI | Agents hub | sample | `#/agents` reads a nightly brief from the calendar and the shadow run: raises, promotions, and booked nights left alone, with no dollar amounts. A cleaner fix note from this browser is included. The Hospitable write stays closed. It opens Co-host and Build and lists the shared jobs. It does not claim a job, send a text, or change the books. |
