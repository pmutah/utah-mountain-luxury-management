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

## 2026-10-29 — cleaner desk

- `#/clean` lists the next two weeks of turnovers from the existing bookings, with a same-day flag and a room checklist. Checks stay in the browser. Bookings and expenses are not written.

## 2026-10-29 — agents hub

- `#/agents` names Co-host, Build, Nora, Muse, and Amanda. Co-host and Build open their existing chats. The shared job list is read from the desk the agents already use. The page does not claim a job.

## 2026-10-29 — shadow daily run

- The Market tab now runs the rate engine against the live calendar. A booked night, a closed River night, or a paused house keeps the published ask. The daily text is on the page and is not sent. Nothing is written to Hospitable or to the books.

## 2026-10-29 — fill rules on the shadow run

- A 20% promotion is recommended only while the year is still short: weekends inside 21 days, holidays inside 14 days, and weekdays once that Friday and Saturday are booked. The published base is not cut. Booked nights stay out of it.

## 2026-10-29 — direct price on the booking page

- `/book` charges the host net, because a direct stay has no platform fee. When the year is still short, nights that qualify take 20% off that host net. The Airbnb list stays on the page beside it. Nothing is charged and no dates are held.

## 2026-10-29 — guest trip steps

- The stay app lists the path from preferences to checkout. When the night before is open, it offers to ask Nora about arriving early. The door code still appears the day before check-in. The guest app stays off until that house is turned on.

## 2026-10-29 — portfolio daily text

- The Market tab leads with one shadow summary for River, Ranch, and Lindon. A paused house stays at its published rates. The text is on the page and is not sent.

## 2026-10-29 — comp pin and hide

- Each house's top 10 can be pinned or hidden in this browser. A hidden sample is replaced by the next bench home, and the rate band uses the set that remains. Nothing is written to the books.

## 2026-10-29 — pace windows and a what-if ask

- Market shows how full the next 30, 60, and 90 nights are on the live calendar, beside the sample comp pace. River nights before November 1 are left out.
- A typed nightly ask is checked against the floor, the ceiling, and the 8% cap. A lower number is not a new base. Nothing is written to Airbnb, VRBO, or Hospitable.

## 2026-10-29 — guest add-ons

- The stay app can request an early arrival, a late checkout, a Ranch hot tub, or a River grocery drop. Early and late appear only when that night is open. The request stays on the phone. Nothing is charged, and the guest app stays off until it is turned on for that house.

## 2026-10-29 — listing opportunities

- Our booking page uses the playbook titles: sleep count and the best feature for each house. A Friday or Saturday by itself is refused until that night is inside 7 days. Market lists what is still open: one photo, and no card charge. Nothing posts to Airbnb, VRBO, or Hospitable.

## 2026-10-29 — owner statement print

- Todd's statement can be printed. The paper copy is Ranch and River after the 20% fee, then half. The rest of the dashboard stays off the page. Nothing on the statement can be edited.

## 2026-10-29 — cleaner photos

- The clean desk can be read in English or Spanish. The photo line stays open until a room photo is attached in this tab. The photo is not uploaded, and the checklist still does not change a booking or an expense.

## 2026-10-29 — shadow day clock

- Each Denver day the shadow run finishes is saved in this browser. Seven different days are required before a rate can be sent, and a Hospitable write token is still required after that. Opening Market on the same day does not add a second day. Nothing is sent.

## 2026-10-29 — house rules before the door code

- The stay page hides the door code and Wi-Fi until the guest taps that they read the house rules. The tap stays on that phone. It does not sign the stay agreement and does not change the reservation. The guest app stays off until it is turned on for that house.

## 2026-10-29 — booking page rules

- Our booking page lists each night’s direct price and the house rules. The request button stays off until those rules are read. Reading them does not sign the stay agreement, charge a card, or hold the dates.

## 2026-10-29 — agent night brief

- Agents reads tonight’s brief from the calendar and the shadow clock. Checkouts are named by house. Guest names stay off the brief. It does not claim a job, send a text, or change a booking or an expense.

## 2026-10-29 — owner month ledger

- Todd’s year-to-date statement lists each month. The month lines use the same Ranch and River split as the total, and they add up to his share. Lindon, household, and construction stay off the page. Nothing on it can be edited.

## 2026-10-29 — guest checkout list

- The stay page turns the checkout note into steps the guest can check off. The checks stay on that phone. They do not change the reservation.
