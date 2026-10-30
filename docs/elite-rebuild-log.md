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

## 2026-10-29 — shadow counts on the brief

- Amanda’s brief now counts raises, promotions, booked nights left alone, and closed nights for River, Ranch, and Lindon. The lines do not include a dollar amount. Nothing is sent to Hospitable.

## 2026-10-29 — cleaner fix note

- A cleaner can write what needs a fix on a turnover. The note stays in this browser and shows on the agents brief. It does not create a task or change a booking or an expense.

## 2026-10-29 — booking page house and party

- The booking page shows the published house: sleep count, check-in and check-out, arrival, parking, and a few nearby places. Door codes stay off that page.
- A party larger than the house is refused. The request stays off until the guest count fits and the house rules are read. Nothing is charged.

## 2026-10-29 — owner month by house

- Each month on Todd’s statement shows Ranch and River. Those two shares add up to that month, the months add up to his share, and each house’s lines add up to that house. Lindon stays off the page.

## 2026-10-29 — grocery list on the stay

- A River guest can write a grocery list with the canyon drop request. The list stays on that phone. Nothing is ordered or charged.

## 2026-10-29 — cleaner work order

- The cleaner desk names checkout at 11:00 AM, and a same-day turn also names the 4:00 PM arrival. Print makes a paper copy of the jobs. It does not create a task or change a booking.

## 2026-10-29 — calendar closed nights

- The booking calendar marks a night Closed before the River House opens, and Booked when it is already taken. An arrival that needs more than one night says so under the month. Nothing is charged.

## 2026-10-29 — minimum stay on the pricing desk

- Market names the booking-page minimum on a shadow move and on the what-if line when that night asks for more than one night. The typed ask still does not change the published rate.

## 2026-10-29 — party split on the booking page

- Two or more overnight guests see how the direct stay total splits. Leftover pennies sit on the first shares so the shares add up to the stay. Nothing is charged.

## 2026-10-29 — shareable stay quote

- The booking page address keeps the house, the dates, and the party. Opening that link shows the same quote again. A name or email in the address is ignored. Copying the link does not send a request.

## 2026-10-29 — owner statement file

- Todd can download the Ranch and River statement he already sees. The spreadsheet uses the same month lines. Lindon, household purchases, and construction stay out of the file. Downloading does not change the books.

## 2026-10-29 — guest trip sheet

- The stay app can print a trip sheet with check-in at 4:00 PM and checkout at 11:00 AM. The paper copy leaves the door code and Wi-Fi on the phone. Printing does not change the reservation.

## 2026-10-29 — direct savings on the quote

- When the direct stay is below the Airbnb guest total, the booking page says how much. The comparison is before tax. Nothing is charged.

## 2026-10-29 — checkout time on the nightly brief

- Each checkout on the agents brief names 11:00 AM. A same-day turn also names the 4:00 PM arrival. The brief still has no dollar amounts, and it does not claim a job.

## 2026-10-29 — occupancy file

- Overview can download the taken nights. The file says which house is unavailable. Names, payouts, and cancelled stays stay out. Downloading does not change a booking.

## 2026-10-29 — cleaner work order address

- The paper work order names the house address and where to park. The door code and Wi-Fi stay off it. Printing does not change a booking.

## 2026-10-29 — direct charge on the market desk

- The what-if line uses the same direct night as the booking page. A booked night stays booked. A closed night is not quoted. Nothing is sent to Hospitable.

## 2026-10-29 — address on the guest trip sheet

- The trip sheet names the house address with the check-in and checkout times. The door code and Wi-Fi stay on the phone. Printing does not change the reservation.

## 2026-10-29 — stays still on the books

- Todd’s page counts Ranch and River stays that still have a night left: in the house, still to come, and nights left. Names and payouts stay off that count. It is not in the spreadsheet, and it does not change a booking.

## 2026-10-29 — house notes on the booking page

- The booking page shows the published notes a guest needs before they ask: the Ranch hot tub, and the River septic and the cold river. The photo caption says when the picture is still a rendering. The address opens a map. Door codes and Wi-Fi stay off the page. Nothing is charged.

## 2026-10-29 — open arrivals on the booking page

- The booking page lists the next three shortest stays it will quote. Picking one fills the dates. It does not send a request, charge a card, or hold the nights.

## 2026-10-29 — open arrivals on the market desk

- The market desk shows the same next arrivals as the booking page. The nightly brief names the first date and the length, with no dollar amount. Opening one does not send a request. Nothing is sent to Hospitable.

## 2026-10-29 — other houses for the same dates

- The booking page lists the other houses that will quote the dates already chosen. A party that does not fit is left off. Choosing a house does not send a request.

## 2026-10-29 — shortest stay from a check-in

- When the dates are too short, the booking page offers the shortest stay that check-in can start. A booked or closed check-in is not offered. Using it does not send a request.

## 2026-10-29 — call 911 first

- The booking page and the guest trip sheet say to call 911 first in a fire or medical emergency. A line that names a door code or Wi-Fi is left off the paper. The door code stays on the phone.

## 2026-10-29 — house notes on the trip sheet and the work order

- The guest trip sheet and the cleaner work order name the published house notes. A note that includes a door code or Wi-Fi is left off. Printing does not change a reservation.

## 2026-10-29 — where the stays on the books were booked

- Todd’s page and the nightly brief say how many Ranch and River stays still on the books came from Airbnb, VRBO, or somewhere else. Names and payouts stay off that line. It does not change a booking, and nothing is sent to Hospitable.

## 2026-10-29 — the open stretch before the next stay

- Todd’s page and the nightly brief name the next open stretch on Ranch and River. River nights before November 1 are left out. Names and payouts stay off that line. It does not change a booking.

## 2026-10-29 — blocked nights stay off the open stretch

- A calendar block, and a stay marked blocked, closes those nights on Todd’s page and on the nightly brief. The stay count still ignores a block. A block note stays off the page. Nothing is written.

## 2026-10-29 — name the source when it is not Airbnb or VRBO

- Todd’s page and the nightly brief keep the source name for a Ranch or River stay that is still on the books. A blank or very long source is called unlisted. Names and payouts stay off that line.

## 2026-10-29 — the full open stretch from a check-in

- The booking page offers how far a check-in can run before the next taken night, up to 28 nights. Using that stretch fills the checkout and does not send a request.

## 2026-10-29 — choose a length inside the open stretch

- The booking page lists the lengths a check-in can quote, from the shortest stay to the open stretch. A length that fails the minimum is left off. Choosing one fills the checkout and does not send a request.

## 2026-10-29 — length choices on the market desk

- The market desk and the nightly brief list the lengths the next open arrival can quote. The brief leaves the price off. Opening a length on the desk does not send a request, and nothing is sent to Hospitable.

## 2026-10-29 — checkout steps before the stay

- The booking page lists the published checkout steps. The trip sheet shows the same kind of list, and a step that names a door code or Wi-Fi is left off. Printing does not change a reservation.

## 2026-10-29 — when the door code opens

- The booking page says the door code and Wi-Fi open on the guest phone the day before check-in, after the house rules are read. An earlier arrival shows only when the night before is open, and it stays a request. The code stays off this page.

## 2026-10-29 — add-on requests on the quote

- The booking page can add an early arrival, a later checkout, the Ranch hot tub, or a River grocery drop to the request. Early and late show only when that night is open. Checking one does not charge a card or send the request.

## 2026-10-29 — add-ons on the market desk and the brief

- The market desk and the nightly brief name the add-ons the next open arrival can request. The lines have no prices. The desk does not send the request.

## 2026-10-29 — guest checkout steps on the work order

- The cleaner work order lists what the guest was asked to do before leaving, in English or Spanish. That list is not the cleaner checklist. A step that names a door code or Wi-Fi is left off. The nightly brief says the same steps once.

## 2026-10-29 — add-ons stay on the quote link

- The booking link keeps the add-ons that are checked. A name, an email, and an unknown add-on stay off the link. Opening it does not send the request. An add-on the nights cannot take is left off once the calendar is known.

## 2026-10-29 — add-ons on each stay

- The guest list says which add-ons that stay can request. The line has no price and no send. An early arrival stays off when the night before is booked.

## 2026-10-29 — nearby places on the trip sheet

- The printed trip sheet lists the nearby places from the guest guide. A place that names a door code or Wi-Fi is left off. Printing does not change a reservation.

## 2026-10-29 — the published nearby list on the quote

- The booking page lists the same nearby places as the published guest guide. River has the canyon list. Ranch and Lindon have the valley list. A door code stays off the page.

## 2026-10-29 — a website or a map for each place

- A nearby place with a published website opens that site. The other places open a map. The trip sheet names the website. A door-code or Wi-Fi link stays off.
