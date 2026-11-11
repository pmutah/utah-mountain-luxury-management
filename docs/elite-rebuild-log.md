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

## 2026-10-29 — quote choices on Todd’s page

- Ranch and River name the lengths and add-ons the next open arrival can take. The lines have no prices. Lindon stays off that list. It is not in the spreadsheet.

## 2026-10-29 — a printable house guide

- The booking page can print the house guide. The paper leaves off the request form. It does not hold the dates or charge a card. The door code stays off the paper.

## 2026-10-29 — the daily text names the next quote

- The unsent daily text names the lengths and add-ons the next open arrival can take when the calendar is live. It still ends with nothing sent to Hospitable.

## 2026-10-29 — nearby places grouped on the quote

- The booking page groups nearby places into ski, food, outdoors, family, and before you go. The same order is on the printed house guide.

## 2026-10-29 — nearby groups on the trip sheet

- The trip sheet groups nearby places the same way as the booking page. A place that names a door code or Wi-Fi stays off.

## 2026-10-29 — a map and the drive notes on the work order

- The cleaner work order links the address to a map and lists the before-you-go notes. Those notes are not the checklist. The door code stays off the paper.

## 2026-10-29 — arrival, parking, and house rules on the trip sheet

- The on-screen trip sheet now shows how to arrive, where to park, and the house rules, the same lines as the paper. A line that names a door code or Wi-Fi is left off.

## 2026-10-29 — the shortest stay on each calendar night

- Each open night on the booking calendar shows the shortest stay that can start that day when it is longer than one night. A Friday or Saturday by itself shows two nights until it is inside 7 days. A gap shorter than that minimum is marked too short. Nothing is booked.

## 2026-10-29 — the market desk uses the booking calendar's start

- The market desk and the unsent daily text name where the booking calendar asks for a longer start than the rate card. A Friday or Saturday shows 2 nights until it is inside 7 days. A night that cannot start a stay is named. Nothing is sent to Hospitable.

## 2026-10-29 — the brief and Todd’s page name the longer start

- The nightly brief and Todd’s Ranch and River page name where the booking calendar asks for a longer start than the rate card. There is no price. Lindon stays off Todd’s page. The spreadsheet is unchanged. Nothing is sent.

## 2026-10-29 — a too-short night cannot start a stay

- A night marked too short cannot be chosen as check-in. It can still be the checkout morning. Nothing is booked.

## 2026-10-29 — when the door code opens, on each stay

- Each stay on the guest list says when the door code opens on the guest phone, or that the stay has checked out. The code stays off the list. Nothing is sent.

## 2026-10-29 — quiet hours on the work order

- The cleaner work order names the guest's quiet hours and no-smoking rule in English or Spanish. That rule is not the checklist. The door code stays off the paper.

## 2026-10-29 — quiet hours on the morning turnover list

- Overview names checkout time and the guest's quiet hours on each turnover. The list does not change a booking.

## 2026-10-29 — house rules in the request note

- A booking request includes the house rules the guest read. Checking the box does not send the request. The note does not include a door code.

## 2026-10-29 — door codes that open tomorrow

- Overview and the nightly brief say how many door codes open tomorrow, by house. Names and the codes stay off. Nothing is sent.

## 2026-10-29 — the stay agreement stays unsigned

- The booking page, the guest trip, the paper, and the nightly brief name what the stay agreement covers. Reading the house rules does not sign it. No agreement is created.

## 2026-10-29 — the next stay on the work order

- A turnover names the date the next stay starts and the date that door code opens. The code stays off the work order, the morning list, and the brief. Nothing is booked or sent.

## 2026-10-29 — Todd’s next checkout

- Todd’s page names the next Ranch and River checkout, when the following stay starts, and when that door code opens. Names, prices, and the code stay off. Lindon is not on the list, and the line is not in the spreadsheet.

## 2026-10-30 — houses that will not quote

- The booking page says why another house will not take the same dates. A party that does not fit, or nights already booked, stays off the offer. Nothing is sent.

## 2026-10-30 — open the longer stay

- When another house only needs more nights, the page can open that longer stay. A party that does not fit, and a booked house, stay closed. Nothing is sent.

## 2026-10-30 — other houses on the next arrival

- The market desk, the unsent daily text, and the nightly brief say which other houses will quote the next open arrival. A booked house and a house that is not open yet are named. No prices, and nothing is sent.

## 2026-10-30 — a calendar block is closed

- A night blocked on the calendar is described as closed. A night with a stay is still described as booked. The calendar is not changed, and nothing is sent.

## 2026-10-30 — closed and booked on the month

- The booking calendar marks a block as Closed and a stay as Booked. A block can still be a checkout morning. The calendar is not changed.

## 2026-10-30 — a block is not a booked night on the shadow run

- The shadow run leaves a calendar block closed and does not count it as a booked night. The rate stays. Nothing is sent.

## 2026-10-30 — blocks leave the pace share

- The 30, 60, and 90 night share leaves a calendar block out of the sellable nights. A stay still counts as booked. Nothing is sent.

## 2026-10-30 — an arrival time on the quote

- The booking page can name an arrival from 4:00 PM through after 9:00 PM. That time is on the quote link and would be in the request note. Arrive at 1:00 PM replaces it. Choosing a time does not send the request.

## 2026-10-30 — children in the party

- Children count toward the overnight guests. A party of only children stays closed. That count is on the quote link and would be in the request note. Nothing is sent.

## 2026-10-30 — how many guests the next stay is for

- The work order, the morning list, and the nightly brief say how many guests the next booking names. Names stay off. Nothing is booked or sent.

## 2026-10-30 — which stays do not name a party size

- Each stay on the guest list says how many guests the booking names. The work order says how many are checking out. The nightly brief names which stays beginning in the next 90 days do not say. Names stay off those lines. Nothing is sent.

## 2026-10-30 — Ranch and River stays on Todd’s page

- Todd’s page lists Ranch and River stays that begin in the next 90 days, with the night count and whether the booking says how many guests. Names and prices stay off. Lindon is not on the list. The spreadsheet is unchanged.

## 2026-10-30 — the printed quote

- The printed house guide includes the direct price, the party, and the arrival time. A refused stay does not print a price. A name stays off the paper. The paper does not charge a card or hold the dates.

## 2026-10-30 — booked nights ahead leave blocks out

- The booking page counts nights ahead as booked only when they are stays. A calendar block stays closed and is not part of that count. Nothing is sent.

## 2026-10-30 — arrival time on the preference card

- River’s preference form asks when the guest will arrive. Choosing a time does not send the form and does not open the door code.
- A host stay card and the nightly brief say whether that card named an arrival time. A phone or any other typed window stays off those lines.
- The trip sheet shows that time when the card already has one. Nothing is sent.

## 2026-10-30 — arrival time on the turn and on Todd’s list

- The cleaner work order and the overview turnover say whether the next stay named an arrival time. The same line is in the nightly brief when preference cards have loaded.
- Todd’s 90-day Ranch and River list includes that time. A phone stays off the line. Names and prices stay off. Nothing is sent.

## 2026-10-30 — departure time on the checkout

- A preference card can name checkout at 11:00 AM or a 2:00 PM leave. The 2:00 PM choice is a request. Nothing is charged yet, and a same-day arrival still starts at 4:00 PM. Choosing a time does not send the form.
- The cleaner, the overview, Todd’s next checkout, and the nightly brief say whether this checkout named that time. A phone stays off the line. Nothing is sent.

## 2026-10-30 — departure time on the booking quote

- The booking page can name 11:00 AM or, when that morning is open, 2:00 PM. Choosing 2:00 PM checks the late checkout request. Choosing 11:00 AM clears it. Nothing is charged, and nothing is sent until the request button is used.
- The printed guide and the quote link include that time. A 2:00 PM leave stays off the quote when the morning is not open.

## 2026-10-30 — party, arrival, and departure on the daily text

- The unsent daily text now says which stays beginning in the next 90 days name a party size. When preference cards have loaded, it also says which of those stays name an arrival time and which checkouts name a departure time.
- A booking note is reduced to a count before it reaches the page. A phone or a name cannot come through as a time. Nothing is sent.

## 2026-10-30 — children named on a stay

- When a booking note names children beside an adult count, the guest list, the work order, Todd’s arrivals, the nightly brief, and the unsent daily text say how many are children. A note that only says a guest total stays as that total. Names stay off. Nothing is sent.

## 2026-10-30 — later leave on the guest trip

- The trip’s checkout step says 11:00 AM. When that morning is open, it also says a 2:00 PM leave is a request and nothing is charged yet. When someone arrives that day, it says a later leave is not open. A saved leave time is shown, and a phone is not.
- The trip sheet says the same thing on the screen and on the paper. Nothing is charged or sent.

## 2026-10-30 — whether a later leave is open for the host

- The guest list, the overview, the cleaner, Todd’s next checkout, and the nightly brief say whether a 2:00 PM leave is a request or that checkout morning is already taken. The sentence waits until the calendar has loaded. Nothing is charged or sent.

## 2026-10-30 — whether the next stay can arrive at 1:00 PM

- The guest list, the overview, the cleaner, Todd’s arrivals, and the nightly brief say whether Arrive at 1:00 PM is a request. It stays closed when the night before is taken or the stay has already started. The door code stays off the sentence. Nothing is charged or sent.

## 2026-10-30 — early arrival on the guest trip

- The trip’s early step says Arrive at 1:00 PM is a request when the night before is open, and that an early arrival is not open when that night is taken. An unknown calendar does not invent the offer.
- The trip sheet says the same thing on the screen and on the paper. Nothing is charged or sent.

## 2026-10-30 — service window on the daily text

- The unsent daily text names the checkouts in the next two weeks and whether a 2:00 PM leave or a 1:00 PM arrival is open. Names stay off that line. Nothing is sent.

## 2026-10-30 — read the stay agreement on the phone

- Before checkout, the trip lists each agreement topic. Marking one read stays on that phone. It does not sign the agreement, and nothing is sent.

## 2026-10-30 — ledger write guard

- An empty read of the saved expenses cannot replace the ledger. A write that would drop a row other than turnover cleaning is refused. This is on the branch and is not deployed.

## 2026-10-30 — twelve-month calendar

- The market page shows the next 12 months. Booked nights and calendar blocks come from the live calendar. Open nights are inside, above, or below the sample comp band. Named events from the rate card sit under the month. The cells do not show a price, and nothing is posted.

## 2026-10-30 — paused storage reads

- When storage reads are used up for the day, Our expenses says the saved list could not be read. Saving over an unread list is refused. Nothing was written over the saved expenses.

## 2026-10-30 — the trip and Todd see the event

- The guest trip sheet names a rate-card event when the stay covers one. The same note is on the paper. Todd’s list of Ranch and River stays does too. Nothing extra is added, and nothing is sent.

## 2026-10-30 — a named event on the quote

- When a stay covers an event already on the rate card, the booking page and the paper name it. Nothing extra is added, and the request is not sent. The unsent daily text names the next event the same way.

## 2026-10-30 — sample amenity gap

- The market page counts what the sample comps list against the published guide. River does not list an EV charger. Ranch does list the hot tub. Hiding a comp changes the count. Nothing is posted, and the comps are not live listings.

## 2026-10-30 — guest message timeline

- The guests page previews the messages a stay would receive, from booking through a return visit. Each one can be switched off in this browser. Nothing is sent. The door code stays off every message.

## 2026-10-30 — public house pages

- `/houses` lists River, Ranch, and Lindon from the published guest guide. Each page has the photo, the address, the rules, and a link to the quote. The River picture is marked as a rendering. A large party can open the two-house quote. Nothing is charged or held, and door codes stay off the page.

## 2026-10-30 — Ranch and River together

- A party larger than the River House can quote both houses for the same dates. Twenty-five stay at the River House and the rest at the Ranch House. Each house keeps an adult. The page and the paper show that quote. Nothing is held, charged, or sent. A party that fits one house does not see it.

## 2026-10-30 — hot tub and grocery prep

- When the next stay has not started, Ranch can request the hot tub and River can request a grocery drop. The cleaner, the overview, Todd’s arrivals, the nightly brief, and the unsent daily text say so. Nothing is charged yet. Lindon has neither.

## 2026-10-30 — the cleaner counts the turn hours

- A same-day turn is 5 hours, from 11:00 AM to 4:00 PM. A 1:00 PM arrival makes it 2 hours. A 2:00 PM leave before a 4:00 PM arrival makes it 2 hours. When a checkout names a 2:00 PM leave, or the next stay names a 1:00 PM arrival, that job uses the shorter clock. The card does not say that anyone asked. Nothing is written.

## 2026-10-30 — a past check-in is refused

- A check-in before today is refused. The quote says that check-in has already passed, with no price. A check-in today can still quote. Nothing is sent.

## 2026-10-30 — the house list answers from the guide

- `/houses` answers a question from the published house guide, including two dates checked against the published stay rules. A past check-in is refused there too. Nothing is sent, and no price is quoted. The agents page uses the same desk.

## 2026-10-30 — the agents desk answers from the house guide

- `#/agents` can answer a question from the published house guide: sleep count, check-in, checkout, parking, quiet hours, the hot tub, the septic, the River House bedroom line, the street address, and how long a same-day turn is. A door code, Wi-Fi, and a price stay off the answer. Nothing is sent.

## 2026-10-30 — the guest list leaves the stand-in off

- When saved bookings could not be read, the guests page does not say there are no stays and does not list stand-in names. The message timeline stays. Nothing is written over the saved rows.

## 2026-10-30 — the launch list leaves the stand-in off

- When saved bookings could not be read, the River launch page does not list stand-in stays or names. The opening checklist stays. Nothing is written over the saved rows.

## 2026-10-30 — the house page names the add-ons and the next event

- A house page names that house’s add-ons and the next event, with no price. The River House names the canyon grocery drop. The Ranch House names the hot tub ready at arrival. The page does not say the house is open.

## 2026-10-30 — the report keeps documents reachable

- When saved bookings could not be read, the management figures stay off the report. The page does not use a stand-in list. The documents vault stays one click away. Nothing is written.

## 2026-10-30 — the paper states the booking rules

- The printed house guide states that house’s booking rules, with no price. The River House is at least 2 nights, with the holiday counts. Ranch and Lindon can be 1 night on a weekday. The paper does not say a night is open, and the door code stays off it.

## 2026-10-30 — the desk marks add-ons and the agreement

- The market desk marks add-ons as already on our page, with no price. The stay agreement is listed and reading it does not sign. Photos and card payment stay open. Nothing is posted to Airbnb or VRBO.

## 2026-10-30 — a house tab keeps its rules

- When saved bookings could not be read, the Ranch, Lindon, and River rental pages still state that house’s booking rules and add-ons, the next event, and the rate rules. The lines have no price. Build costs stay separate. The stand-in list stays off.

## 2026-10-30 — the home page keeps the next event

- When saved bookings could not be read, the home page still names the next event and the rate rules. No night is raised. The lines have no price. The stand-in list stays off the page.

## 2026-10-30 — the house list names the add-ons

- The house list names what a guest can request, with no price. The River House names the canyon grocery drop. The Ranch House names the hot tub ready at arrival. The Lindon House has neither. An early arrival and a later checkout wait. The list does not say a house is open.

## 2026-10-30 — Todd’s card keeps the rate rules

- Todd’s card states the rate rules with no price. A night stays at or above the floor and at or below the ceiling. A change stays inside 8% of the day before. The published base is not lowered. Nothing is posted. The nightly brief repeats that line when saved bookings could not be read.

## 2026-10-30 — the paper names the add-ons

- The printed house guide names the house add-ons with no price. The River House names the canyon grocery drop. The Ranch House names the hot tub ready at arrival. An early arrival and a later checkout wait. The paper does not send a request, and the door code stays off it.

## 2026-10-30 — the desk keeps the rate rules

- When the calendar cannot be read, the market desk still states the rate rules. A night stays at or above the floor and at or below the ceiling. A change stays inside 8% of the day before. The published base is not lowered. The line has no price, and nothing is posted.

## 2026-10-30 — the brief keeps the split

- When saved bookings could not be read, the nightly brief states the Ranch and River split, including that a hot tub request and a grocery drop follow it. No ledger amount is in the brief. No night is raised. Nothing is sent.

## 2026-10-30 — Todd’s split covers the add-ons

- The owner card says a hot tub request at the Ranch House and a grocery drop at the River House follow the same split as the stay. An early arrival and a later checkout on those two houses follow it too, and they wait until the calendar can be read. The card does not say that anyone asked, does not charge either one, and leaves Lindon off. No ledger amount is on the card.

## 2026-10-30 — the cleaner keeps the standing prep

- When the turnover list cannot be read, each house card still says the standing prep. The River House leaves grocery bags in the kitchen only if the next stay asked. The Ranch House uncovers the hot tub only if the next stay asked. The Lindon House has neither. The card does not say that anyone asked, does not name a stay, and charges nothing.

## 2026-10-30 — the week-before message names the add-ons

- The week-before preview names the house add-ons with no price. The River House names the canyon grocery drop. The Ranch House names the hot tub ready at arrival. An early arrival and a later checkout wait. The message is not sent, and the door code stays off it.

## 2026-10-30 — the quote names the add-ons

- When the calendar cannot be read, the quote still names the house add-ons with no price. The River House names the canyon grocery drop. The Ranch House names the hot tub ready at arrival. An early arrival and a later checkout wait. The request stays off. Nothing is sent.

## 2026-10-30 — the house list compares the night rule

- For the same dates, the house list names a published night rule for each house that fails it. A one-night Friday names the River House minimum and the weekend rule at Ranch and Lindon. A house that meets the rule is left off. The lines have no price and do not say a house is open. Nothing is written.

## 2026-10-30 — the year marks the shortest stay

- Each month on the market year says the shortest stay, and a longer count when some nights ask for more. October at the River House says no stay starts. November says at least 2 nights, and some nights ask for 4. The line has no price and does not say a night is open. Nothing is posted.

## 2026-10-30 — the halfway message names nearby places

- The mid-stay preview names one ski hill, one meal, and one outdoor place from the published guide. The River House names Sundance, the Tree Room, and tubing on the Provo River. Ranch and Lindon name Sundance, Oteo, and the Provo River Parkway. The message has no price and is not sent.

## 2026-10-30 — the confirmation carries the booking rules

- The booked message for each house includes that house’s booking rules. The River House message says at least 2 nights and the holiday counts. Ranch and Lindon say a weekday can be 1 night. The preview has no price and is not sent.

## 2026-10-30 — the house page states the booking rules

- Each house page states the booking rules with no price. The River House is at least 2 nights, and holidays ask for more. Ranch and Lindon can be 1 night on a weekday. A Friday or Saturday by itself waits until the last week. A request can cover up to 28 nights. The page does not say a night is open.

## 2026-10-30 — the quote names a published stay rule

- When the calendar cannot be read, the quote still names a published stay rule: a stay that is too short, a Friday or Saturday by itself before the last week, or a night before the River House opens. The rule has no price and does not say the house is open. Nothing is sent.

## 2026-10-30 — the quote names the party fit

- When the calendar cannot be read, the quote still says whether the party fits that house. A party larger than one house is told that Ranch and River together sleep 45. That line does not hold the dates. The request stays off. Nothing is sent.

## 2026-10-30 — the paper lists the agreement topics

- The printed house guide and the trip sheet list the same stay-agreement topics as the quote. The paper says it does not sign them. Nothing is sent.

## 2026-10-30 — the quote lists the agreement topics

- The direct quote lists occupancy, damage, the house-specific topic, and the release. River names the river and the septic. Ranch names the hot tub. Reading the list does not sign the agreement, and the request stays off while the calendar cannot be read. Nothing is sent.

## 2026-10-30 — a party is matched to the sleep count

- When the calendar cannot be read, the house list still says which houses a party fits. A party larger than one house is told that Ranch and River together sleep 45. That line does not hold the dates and does not say a house is open. Nothing is written.

## 2026-10-30 — the house list says what each house is

- `/houses` compares the published title, arrival, parking, and house notes for River, Ranch, and Lindon. The River photo stays a rendering. The list has no price and does not say a house is open. Nothing is written.

## 2026-10-30 — the brief keeps the next event

- When saved bookings cannot be read, the nightly brief still names the next event and how many sample comps set the River, Ranch, and Lindon bands. The published ask stays. No night is raised or promoted. Nothing is written.

## 2026-10-30 — the cleaner keeps the houses

- When the turnover list cannot be read, the cleaner desk still shows River, Ranch, and Lindon: checkout time, parking, quiet hours, house notes, the guest’s checkout steps, and the standing clean list. English and Spanish. The card does not name a stay. Nothing is written.

## 2026-10-30 — Todd’s page keeps the split

- The owner page states the Ranch and River split with no ledger amounts: 20% to Brandon first, then half of what remains, including a loss. Lindon, household purchases, and construction stay off the page. The card stays up when the saved bookings could not be read. Nothing is written.

## 2026-10-30 — the house list compares the rhythm

- `/houses` shows arrival, quiet hours, and checkout for River, Ranch, and Lindon when dates are set. That comparison has no price and does not say a house is open. Nothing is sent.

## 2026-10-30 — a far sample stays off the rate band

- A sample more than 10 miles away stays on the list. When at least four samples are close in size and nearby, the rate band uses only those. The published ask does not drop. Nothing is posted.

## 2026-10-30 — the guest phone names one step

- The stay page names one current step. The other open steps stay on the list. The host preview says whether that stay is before arrival, in the house, or finished, from the dates only. Names and the door code stay off. Nothing is sent.

## 2026-10-30 — the quote names the house rhythm

- A direct quote lists arrival, when the door code opens, quiet hours, and checkout for those dates. The list has no price and does not hold the dates. The same lines are on the paper house guide. Nothing is sent.

## 2026-10-30 — the house panel waits for the calendar

- When the calendar could not be read, the house shadow panel does not list raises. When it can, the daily text says how many sample comps sleep close enough to set the band. Nothing is sent.

## 2026-10-30 — smaller houses stay off the rate band

- A sample comp that sleeps under 60% of the house stays on the list. When at least four samples are close, the rate band uses only those. The published ask does not drop. Nothing is posted.

## 2026-10-30 — a paused book is not the rate card

- When saved bookings could not be read, the nightly brief does not raise or promote a night from the stand-in list. Overview, the report, Todd’s statement, the cleaner desk, and a house page stay off that list. Nothing was written over the saved rows.

## 2026-10-30 — a shadow day needs the calendar

- When the calendar could not be read, the daily text does not raise or promote a night, and that Denver day is not saved toward a rate push. The twelve-month view does not say which nights are booked or open. Nothing is sent.

## 2026-10-30 — the message preview uses the stay

- The guests page preview names the check-in and checkout of the stay on the books, and a rate-card event when that stay covers one. A stay in progress is the one shown. Names stay off. Nothing is sent, and the door code stays off every message.

## 2026-10-30 — a quote waits for the calendar

- When the booking page cannot read the calendar, it does not show a price, the month grid, or the add-on prices. The request stays off. The paper says the calendar could not be read. Nothing is sent.

## 2026-10-30 — which houses will quote

- `/houses` takes dates and a party and says which houses will quote. The list has no price. A party larger than the River House can see Ranch and River together. When the calendar cannot be read, the page does not say a house is open. Opening a house does not send a request.

## 2026-10-30 — the calendar and the clean mark the event

- The booking month marks a rate-card night with Event and lists that month’s names under the grid. The nightly rate does not change. A cleaner work order and the Today turnover say when the next stay covers one of those events. Nothing extra is added. Nothing was sent, and the saved expenses were not written.

## 2026-10-30 — two houses on the same checkout

- When two or three houses check out on the same day, the cleaner desk and the morning list say whether those same-day turns overlap. A 1:00 PM arrival and a 2:00 PM leave can fit one after the other. A turn with no same-day guest can wait. Nothing is booked or sent. Guest names stay off the line.

## 2026-10-30 — a night no stay can cover

- The shadow run leaves a night at the published rate when no stay can cover it. A one-night hole at the River House stays put. A Friday with the nights on both sides already taken stays put until that Friday is inside 7 days. The night is not raised and it is not promoted. Nothing is posted.

## 2026-10-30 — Nora answers the house guide on the phone

- A house-guide question on the stay page is answered on that phone. Nora does not text Brandon for it, and the chat is not saved. A question the guide does not cover still goes to Nora. The door code and a price stay off the answer.

## 2026-10-30 — a typed ask cannot book a stranded night

- A typed nightly ask on a night no stay can cover does not become a new base. The note says that night cannot be booked and the published rate stays. Nothing is posted.

## 2026-11-07 — a these-dates question names both houses

When the party count on the page needs both houses, a “these dates” question on the house guide or the quote search names the compound stay instead of quoting one house. Nothing is sent.

## 2026-11-07 — a named event on the house guide follows both calendars

When the party count on the page needs both houses, a named event question on the house guide follows the River House and the Ranch House calendars. Thanksgiving booked at the Ranch House is named and is not offered as a quote. Nothing is sent.

## 2026-11-07 — the house guide follows both calendars for early and late

When the party count on the house list or a house page needs both houses, an early or late question on the house guide follows the River House and the Ranch House calendars. The door-code timing stays off the desk. Nothing is sent.

## 2026-11-07 — the house list follows both calendars for early and late

When the party needs both houses, the house list add-on line follows the River House and the Ranch House for early arrival and later checkout. A party that fits one house stays on that house. Nothing is sent.

## 2026-11-07 — a two-house quote counts nights ahead at either house

On a quote for both houses, the nights-ahead line follows the River House and the Ranch House calendars. A night booked at either house is counted. Lindon stays off that count. Nothing is posted.

## 2026-11-07 — a pinned comp changes the host desk gap

A comp pinned on the market page changes the sample amenity gap on the host desk at `#/agents`. The public house guide still ignores pins. These stay sample comps. Nothing is posted.

## 2026-11-07 — a two-house event follows both calendars

On a quote for both houses, a named event follows a night booked at the River House or the Ranch House. Thanksgiving booked at the Ranch House is named and is not offered as a quote. A start both houses can take still names the shortest stay. Nothing is posted.

## 2026-11-07 — a pinned sample changes the co-host brief

A comp pinned on the market page changes the co-host brief’s sample gap and the shadow band. A hidden comp still stays out. These stay sample comps. Nothing is posted.

## 2026-11-07 — a house page follows both calendars for early and late

When the party needs both houses, the house page early arrival and later checkout follow the River House and the Ranch House. A night booked at either house stays off. A party that fits one house stays on that house. Nothing is sent.

## 2026-11-07 — a host can decline a request

The inbox could accept but not decline, so a host who could not take a stay had to let the 30-minute hold run out while the guest waited on "someone will write back". `POST /api/book/decline` records the decision with a reason, lets the hold go, and tells the guest the dates are not available. The inbox shows the decision in place of the buttons, so the same request is not handled twice.

A decline is refused for a request that already became a booking, because that would tell the guest to stop after the stay was saved. A reason is required, and the six offered are dates taken, party too large, too short a stay, closed for work, family using the house, and other. The guest note names the houses and the dates, gives a plain reason, invites a different range, and quotes no price. Declining writes no booking, expense, or receipt.

Also fixed while testing: `housesForRequest('denver', 'ranch')` returned `['ranch']`, so a request naming a house we do not rent could pass a check that only looked at the second house. A first house that is not one of the three now makes the whole request invalid.

A decline also stops the desk chasing itself. The summary counted every saved request as waiting, so a request the host had already declined still read "waiting" and could be flagged "waited more than 2 days". An accepted or declined request is now an answer, and the summary says so. A declined request frees its dates: after one, the same nights can be requested again. The guest note carries the host's own words when they add them, and the note is stripped of a price like the rest of the mail.

The desk also counts why requests were declined over the last 30 days. A host who keeps turning down the same reason is looking at a rate or a rule rather than bad luck, so the line names the top reason and how many of the total it was. A decline with an unknown reason is left out rather than guessed at.

The two-house payout split follows the houses themselves. An even split said the Ranch earned half of a party of 30 that puts 25 in the River House. The route now prices each house for its own party and splits the host net in that proportion, so a $9,000 request reads about $6,749 on the River House and $2,251 on the Ranch House, and the two still add up exactly. A quote that cannot price both houses falls back to an even split rather than giving one house a stay with no revenue.

Money is now whole cents everywhere it is computed. Todd's December statement read **1908.3439999999998** before this, and the metrics behind it carried artefacts like `5921.5599999999995` and `-1163.8400000000001`. Those came from plain floating-point arithmetic on the season rates, and they would reach a report, a statement, or a downloaded file. `calculateMetrics` rounds every figure to cents at the source, and the statement rounds again so its house shares still sum to the total exactly.

The report had a second copy of the same problem. `#/report` builds its own figures rather than reading the metrics endpoint, so rounding only the server left `5921.5599999999995` on the page that prints. The report now rounds revenue, profit, ADR, revpar, average booking, and the owner split, and leaves the ratios alone: occupancy and margin are percentages, not money. The owner letter's spreadsheet was already clean. The market rate band was already whole dollars.

A declined guest now gets a way back. The note used to say "reply with a range", which asks the guest to write an email when our own booking page already exists. It now carries an absolute link to that house's page with the dates and party filled in, so moving the dates is a click. The link is only printed when it is a plain same-site path with an origin, so nothing like a `javascript:` href can reach an inbox, and the reply wording is still offered beside it.

A two-house booking now gives the guest **two** stay pages. The accept route minted one link for the first house, so a party of 30 sleeping in both houses had a page for the River House and nothing for the Ranch House: no Ranch parking, no hot tub rule, no Ranch door code. Each stay now gets its own token, the confirmation lists both pages by house name, and the host desk shows both links so either can be resent. Each link opens its own guide, which a test confirms by checking the house the page reports.

## 2026-11-07 — a past guest is reported as a past guest

The booking form sent `returning: false` on every request, so the team was told every direct request came from someone new. `POST /api/book` now works it out itself from the guest's own contact details against the past stays: an email or a phone that matches a completed stay counts, a cancelled or not-yet-finished stay does not, and a name alone never counts, because two people share a name and a wrong "returning" would treat a stranger as a repeat guest. The line the team reads now says when the last stay was and how many there were, and it does not repeat the contact detail. A phone matches however it is typed, so `+1 (801) 787-4722` and `8017874722` are the same guest. The form no longer sends the flag at all.

## 2026-11-07 — the River House costs $600 to clean

The River House had a cleaning fee of zero, so the P&L counted no cleaning cost for a 25-person house across four real bookings worth about $37,000. River profit and Todd's share were overstated by that much. The fee is now **$600**, and it flows through the same three places the other houses use: the server property table, the client mirror, and the direct quote.

A River shoulder weekend now reads $4,200 lodging plus $600 cleaning, so the direct total is $4,800 and the channel total $5,572. The direct saving is unchanged at $772, because both sides carry the same cleaning fee; that is what the quote means by a saving on lodging. A test now pins each house's fee so one cannot quietly drift back to zero.

## 2026-11-07 — a two-house accept books both houses

Accepting a request for the River House and the Ranch House saved only the first house. The guest was told both were booked, the host had charged for both, and the second house stayed empty and bookable while the party was in it. The route now saves one stay per house and marks the second as the second house on the same request, and the public calendar blocks both.

The money is split across the two stays too. Carrying the whole host net on the first house meant a Ranch statement showed a stay with revenue of zero and a cleaning cost against it, which reads as a loss on a booking that earned. A $9,000 request now reads $4,500 on each house, and any odd cent lands on the first stay so the two still add up to the request total.

Also found: `ensureTurnoverCleaningExpenses` in `expenses.ts` is never called from anywhere. It is dead code, not a live bug, because the P&L falls back to `stayCount × cleaning fee` when no cleaning expense exists. It is left in place rather than wired, since turning it on would start writing expenses and that is not a change to make without asking.

## 2026-11-07 — a guest app cannot go live thin

All three guest apps are off in production, and the switch in the editor had no check on whether the guide had anything in it. Turning one on would hand a guest a nearly blank page. The switch now asks a readiness check first, and `POST /api/guest-guide` refuses the same case: a house needs a headline, the street address, how to arrive, where to park, the checkout steps, at least one house note, and at least three nearby places. The editor says which of those is missing instead of only offering a switch, and a house that is on but thin says so rather than pretending it is fine.

Against the live site this is concrete: **Ranch and River are ready to turn on, and Lindon needs one house note.** Saving a field is never blocked; only the switch is.

## 2026-11-07 — the cleaner's photo closes the desk step

A cleaner could upload a room photo, but the desk still counted only photos attached in the desk's own browser tab, so the turn read as unfinished. `GET /api/clean/photos` now returns every uploaded photo grouped by turn, and the desk counts them the same as a local one. Only a turn that is on the desk is listed, so a stale row cannot add a photo to a house. The desk's note says "1 from the cleaner's link" rather than "not uploaded", and the photo opens from the desk through a host-only read that still refuses a path this app would not have written.

## 2026-11-07 — the cleaner can take the room photo

The cleaner's step list said "Photo each room before you leave" and gave them no camera. A cleaner on their own link can now add a photo straight from the phone, and the next time they open the link it is already there.

The rules are strict because that link has no login: a JPEG, PNG, or WebP only, under 4 MB, at most 12 on one turn, and the turn has to be on that cleaner's list. Size is measured on the decoded bytes, so a caller cannot claim a small file and send a large one. A photo path is only readable if this app would have written it, so a guessed path cannot reach another house or the receipt folder. A photo row carries a time and no guest name, and the line says how many photos are on the turn rather than calling the house ready.

## 2026-11-07 — the server code is typechecked for the first time

`tsc -b` only covered `src`. The 165 files under `functions/` were never typechecked, which is how a broken import in the requests route and a duplicate `body` declaration both reached the working tree. A new `tsconfig.functions.json` with the Cloudflare Workers types now covers them, and `npm run check:functions` runs it.

Turning it on found **two real runtime bugs** from the bulk guard patch: `esign/lien-release.ts` and `esign/templates/index.ts` called `hostOnly(request, env)` in handlers that never destructured `env`, so both routes would have thrown a `ReferenceError` the moment anyone opened them. Both now bind `env`, return 200 signed in and 401 anonymous, and a test reads the source and fails if any handler calls a guard with an env it never bound — proven by reintroducing the bug and watching it fail.

It also corrected the `hostOnly` signature. Narrowing the parameter to a three-field type rejected every real env in the codebase; the parameter is now `unknown` and the three fields are read through one helper, so a route's env type does not have to change.

It found a **data-loss bug** in `PUT /api/pricing/listings`: the merge built only `ranch` and `lindon` while `saveListingConfig` stores all three, so saving a listing change silently erased the River House configuration. Both typechecks are now clean.

## 2026-11-07 — the OpenAPI spec lists the routes that exist

`/api/muse/openapi.json` declared **two** paths while the API had dozens. Any agent that trusts a standard spec over a prose map could not see the booking inbox, the cleaner link, Todd's portal, saved comps, or the rate push plan at all. A new `routes.ts` registry now feeds the spec, and the agent map reads the same list, so the two cannot disagree.

The spec declares 25 paths: twenty-one bearer routes with their real refusals (a write advertises 400, 409, and 503; a read does not advertise 201), plus the four token-in-the-path routes marked `security: []` because the token is the whole credential. Each route carries a note where an agent would otherwise guess wrong: the push plan has no writer, the guest guide blanks the way in, and a comp needs a sleep count and a distance.

Three tests keep it honest: every declared path must have a route file on disk, the map and the spec must list the same paths, and no secret may appear in the spec.

## 2026-11-07 — the agent map tells the truth again

`GET /api/agent/map` and `/llms.txt` are what Muse, Amanda, and the browser bots read first. Both had gone stale: the map still told agents that the public house guide returns door codes and Wi-Fi, which stopped being true when that route was gated, and neither file named any of the thirteen routes built this session. A bot following the old map would either expect a secret it can no longer get or never discover the booking inbox, the cleaner link, Todd's portal, saved comps, or the rate push plan.

Both now state the auth rule as it actually runs, say the public guide blanks the way in, and list every new route with what it does and whether it can send. Two tests read the real files and fail if a route goes unlisted, if the map claims a send the route cannot make, or if a secret appears in either.

## 2026-11-07 — the rate push now has a plan

The Market page shows what a rate push would actually change, house by house and night by night. The plan is built from the same shadow run the board already uses, so every guard carries over: a booked, closed, paused, holiday-locked, or held night is never in it, and a raise never goes under the floor. A held night had slipped through at first because `hold` was not in the blocked list; that is fixed and pinned by a test. The plan is refused outright while the shadow week is unfinished, while there is no write token, while the house is paused, or when the calendar could not be read, and the reason is named. The route has no writer at all, so even with every gate open nothing can be sent from it, and no price appears in the summary.

## 2026-11-07 — the cleaner can tick the work, and the desk sees it

A cleaner ticks each step on their own link and the tick saves on the server, so closing the tab does not lose the work. A tick is keyed by step id, so switching to Spanish does not clear it. Only ids that turn actually has are kept: a same-day step cannot be ticked on a normal turn, and an invented id is dropped. A turn reads as untouched, started, or done, and the clean desk says which, with how many steps are still open. A turn with no tick is never called done, and a progress list that could not be read is named instead of reading as "nothing ticked". Ticking writes a tick only; the booking, the expense ledger, and the receipts are not touched.

Every date check in the app now goes through one `isRealDay` helper. A digit pattern alone accepted a month of 13, and that bug had been written three separate times.

## 2026-11-07 — a cleaner can open the job on a phone

The clean desk needed a dashboard login, so a cleaner standing in a house had no way to see the turn. `#/clean` can now make a link per cleaner. It opens `/clean/<token>` with no login and shows the next two weeks: the house, the day, what to do, how to get in, and the house rules, in English or Spanish. A same-day turn leads with the 4pm deadline. The link carries no door code, no guest name, and no rate, and the host's label for the cleaner does not appear on the page. A link that is taken back stops working, a link that was never minted reads as invalid, and a job list whose bookings could not be read says so instead of showing an empty day. Making a link does not text it.

## 2026-11-07 — private data was open to anyone

The deployed site has no dashboard password set, and the auth check treated a missing password as "signed in." Every private route therefore answered an anonymous caller: the expense ledger, the booking list with guest names and payouts, guest survey tokens, e-sign documents, construction files, and the River House Wi-Fi password from the public guide route. This was found by reading the live site, not by a test.

The rule is now that a host route needs a password to exist and a matching cookie to run, or a valid Muse/Amanda bearer. A deployment with no password refuses private reads with a plain "this site has no dashboard password set" instead of opening them, and the sign-in page says the same rather than rendering a dashboard full of errors. The public booking page, the availability calendar, the market overview, a guest stay link, and a guest request all still work without a host login. The guest stay guide keeps the door code and Wi-Fi off the wire until the stay window opens, and a guest guide read for one house does not return another house's secrets.

`npm run check:guards` reads the route source and fails when a host route loses its guard or a guest route returns a door code or Wi-Fi password with nothing in front of it. It runs first in `npm run deploy`, so this class of mistake cannot ship quietly. Setting `DASHBOARD_PASSWORD` in Cloudflare Pages and redeploying is what reopens the dashboard, and that step is not done yet.

## 2026-11-07 — a stranger's page cannot read the books

The API answered any website with its own `Origin` reflected back and credentials turned on, so once a password existed any page a host visited could have read the ledger with their cookie. The allow-list is now the deployed origin and the two local dev ports. A stranger gets `Access-Control-Allow-Origin: null` and no credentials line at all, and every response carries `Vary: Origin` so a cache cannot hand one caller another caller's answer. `npm run check:guards` also fails on a route that reflects `Origin` by hand instead of using the shared header.

## 2026-11-07 — an accepted direct guest gets the portal

Accepting a direct request now mints the same guest link an OTA guest gets, so the house guide, the preference form, and the door code all work for a guest who booked on our own site. The link is saved on the stay, so the host can resend it. If the guest app is off for that house, the host desk says so instead of leaving a link that only says the app is off. A link that could not be made says why and does not fail the booking.

## 2026-11-07 — the guest hears back

A direct request now returns a receipt to the guest that says the dates are a request and not a booking, names the houses, the dates, the nights, and the party, and says a person will write back. It never carries a price or a door code, and a price or code that slipped into the source is stripped before sending. Accepting a request sends a confirmation that names check-in and checkout and says the door code opens on the guest phone the day before. A confirmation that does not send leaves the booking in place and says so on the host desk instead of looking sent.

## 2026-11-07 — a request becomes a booking

The host inbox can now take a saved request and make it a booking. The host names the payout, and the stay is saved with the party in its note and the request id, so the same request cannot be accepted twice. Accepting is refused when those nights are already on that house, when the check-in has passed, when the children do not fit inside the party, or when the payout is not a real number; a request whose list could not be read is refused rather than booked blind. The hold lets go as soon as the booking is saved. The page says nothing was sent to the guest from here, and it does not quote a rate or show a door code.

## 2026-11-07 — a request holds the dates

A request that the quote accepts now holds both houses it names for 30 minutes, so two guests cannot request the same nights and both be told yes. A second guest is refused with “The River House has those nights held while another guest finishes. Nothing is booked.” A hold that expires, or that the host releases, stops blocking on its own, and a request whose hold list cannot be read is refused rather than saved blind. The guest sees the hold time after a request, and the public calendar lists a held night apart from a booked one so a night another guest is finishing is never reported as booked. Nothing is charged, and a saved booking is not changed.

## 2026-11-07 — the shadow week is saved on the server

The seven-day shadow clock that authorizes a Hospitable write used to live only in a browser tab, so clearing the tab reset the week. Each finished Denver day now saves to the settings store. A day that could not read the calendar removes its date instead of leaving an older one, a digest that could be sent is refused, and a future date does not count. The market page shows the saved clock and falls back to the tab only when the save does not land. Reading the clock does not return the write token, and no rate is sent.

## 2026-11-07 — a saved comp is a card on the board

The market page lists the comps saved on this desk. Each card names the area, the distance, the sleep count, and the ask that was actually observed. A comp with no saved ask says so instead of showing a price, and a comp that sleeps too few or sits too far says it is not in the band. A host can save a comp by URL, label, sleep count, and distance; a save without a sleep count or a distance is refused, so a missing number cannot move a rate. The page says “3 saved comps” rather than calling them samples. Nothing is posted to Airbnb, VRBO, or Hospitable.

## 2026-11-07 — a saved comp can set the band

A comp saved on the market page now reaches the rate band when it names how many it sleeps and how far it sits. The saved ask for that night replaces the stand-in, and a night no saved comp watched keeps the sample. A comp without a sleep count or a distance stays out, so a missing number cannot move a rate. A malformed date such as a month of 13 is refused. The board says which source set the band, and a paused read says so instead of showing a stand-in as live. Nothing is sent to Airbnb, VRBO, or Hospitable.

## 2026-11-07 — a host can record the ask a comp lists

A saved comp could set the rate band only on a night that carried a saved ask, and nothing on the desk wrote one, so the live band stayed dormant no matter how many comps a host saved. Each saved-comp card now takes a night, a guest ask, and how many nights that ask runs for, and records them. A listing shows one rate across a run of nights, so the run is what gets saved rather than one night at a time: five nights at $2,650 records five nights, each on its own date, and the band reads every one. `POST /api/pricing/snapshots` is host-only, refuses an ask that names a comp not on the list, refuses a save over 120 nights, and checks every row before it writes any, so a bad night does not half-save a set. A month of 13 or a 30th of February is refused. Nothing is sent to Airbnb, VRBO, or Hospitable, and no rate is posted.

## 2026-11-07 — the second fabricated ledger, one route over

I fixed `/api/portfolio/metrics` for substituting seed data on a failed read, and checked only that route. **`/api/portfolio/history` had the identical fallback**: 75 stand-in stays and 25 stand-in expenses, returned behind a 200, feeding the twelve-month chart on the same page.

It was unreachable, and only by accident — `loadExtraCleaningFees` refuses earlier in that route, so the fallback never ran. That is worse than a live bug in one way: dead code that a reordering would bring back. I removed it rather than leaving it as a trap, so both reads now return 503 with a reason and the route reports `storageReads: 'ok'` only because nothing below that point can run on a paused read.

A test now reads the route sources and fails if **any** of them reaches for `seedReservations()` or the seed `EXPENSES` list. I confirmed it catches a reintroduction by appending a seed call to `history.ts`: red, naming the file. Then removed it.

The seed set is legitimate — it lets the product be seen before a store is connected. The bug was never its existence; it was using it as the answer to a failure.

## 2026-11-07 — the read limit was partly self-inflicted, and one route read a key three times

I had asserted twice that production was hitting its daily KV read limit without testing it. This time I proved it, by running every other failure mode through the same route and comparing:

| State of the store | What the metrics route answers |
|---|---|
| Binding **absent** | 200, `storageReads: ok`, seed rows |
| Binding present, **limit error** | 503, `storageReads: paused`, no data |
| Binding present, plain error | 200, `ok`, seed rows |
| Healthy | 200, `ok`, seed rows |
| **Production today** | 200, **`paused`**, **75 rows** |

Production is `paused` *with* data, which only the old code produces, and `paused` is set only when the error matches a limit pattern. So the binding exists and the data behind it is intact — reads are being refused, not missing. That is the strongest evidence yet that the books are recoverable.

Two things were causing it, and one is mine.

**The dev server reads production.** `vite.config.ts` proxies every `/api` call to the live site, because a local dev server has no KV binding. I have loaded the dashboard hundreds of times today, and each page load spends production's KV reads. Dev now sends an `x-uml-proxied-from: production` header so nobody mistakes a live response for a local one, and `VITE_LOCAL_API` can point it elsewhere.

**`/api/expenses` read the same key three times per request.** The route calls `mergeAllExpenses` and `loadCustomExpenses`, and both read `customExpenses`, so one request cost three KV reads. It costs one now.

The fix is a per-request cache on the env object, which Cloudflare creates fresh per request, so it cannot outlive one. A `put` clears the matching key, so a read after a save inside the same request sees the new value; a failed read is not cached, so a retry can still succeed. All three are pinned by tests, because a cache that serves stale ledger data would be worse than the reads it saves.

Measured, not assumed: `/api/expenses` went from **3 reads to 1**, and no route reads a key more than once — down from one route doing it three times.

I also checked my own reasoning when the first measurement came back unchanged at 8 reads. The cache had not helped the metrics/history pair, and rather than call the change a win I went looking for where it *should* have helped and found the two stores that bypass `kvGet` entirely.

## 2026-11-07 — the write half of the same bug: 25 more handlers

The previous audit walked **GET** routes only. That is half the surface, and the write half is worse: a write that reads the current state before saving can half-commit, and a write that answers "ok" against an unreadable store is the most dangerous answer there is.

So I walked every exported handler on every route — **141 handlers** across GET, POST, PUT, PATCH and DELETE.

**25 more threw** an unhandled `StorageReadError`. **None answered a write with success**, which is the one piece of good news: nothing was silently half-writing.

Fixed in order of risk:

- **A read-then-merge write is a data-loss path.** `/api/pricing/listings` builds the saved config by spreading the current one across all three houses; if that read fell back to defaults, a save would erase whichever house the caller did not send. `/api/construction/project` has the same shape — the save spreads the current project, so a default would blank every field the caller omitted. Both now refuse rather than save a partial board.
- **The delete path** on expenses reads the ledger before archiving and removing, so a failed read must not proceed to remove anything.
- **Guest writes** — the signing POST, the house-control and voice routes, the text-the-host route and the preference form — now refuse with a reason instead of returning a dead page to someone mid-stay.
- **Host writes** — reservations create and patch, ops tasks, automation settings, comp refresh, the vault and construction document patches and deletes, the shared job list, and expense item photos.

The test was extended from GET-only to every handler, and it now also fails if any write answers 2xx while the store is refusing reads. I checked it catches a regression by reverting `/api/pricing/refresh` to its old unguarded shape: the test failed naming that exact route and saying an unhandled throw is Error 1101. Then I restored the guard.

141 handlers walked. **0 throw, 0 falsely report a write.**

## 2026-11-07 — twenty-four routes turned a read failure into an Error 1101

Rather than keep fixing one route at a time, I walked **all 97 GET routes** against a store that refuses reads and recorded what each answered. Twenty-four threw an unhandled exception — every one of them a Cloudflare **Error 1101** in production, which is what the live site was doing.

The cause was uniform: an unguarded `await load...()` at the top of a handler. `kvGet` raises a `StorageReadError` when the store is at its read limit, and any route that did not catch it crashed the whole request.

One shared helper, `readOrRefuse`, now wraps a read and gives back either the value or a 503 with a sentence naming what could not be read. `withPausedGuard` does the same around a whole guest handler, for routes that resolve a token to a stay before they can answer anything.

Fixed in order of who is hurt:

- **Guest-facing** first — the signing link and its document, the preference form, the stay manifest, the chat and thread, and the public house guide. A dead guest page during a stay is worse than a dead admin page.
- **The ledger and the ops desk** — reservations by id, expense receipts and item photos, construction project and documents, the vault, the shared job list, automation settings, pricing alerts, comp set, listing config, yield plan, Gmail status.
- **The agent routes** — `agent/work` and the finance handler, which had no try at all, so a throw ended the whole chat turn.

Both file-serving routes needed the guard around the **lookup**, not the byte stream, or a paused store would have thrown before reaching the `try` that already wrapped the download.

Then I made it permanent: `no-route-throws.test.ts` walks the real route files, runs each against a refusing store, and fails naming any route that threw, with the sentence explaining that an unhandled throw is an Error 1101 rather than a 503. It went from 24 failures to zero.

The audit detail matters more than the count. `/api/portfolio/metrics` was the route I had already fixed by hand; the other 23 I would not have found by eye, and **three of them sit on the guest's phone** — a store at its limit would have killed the signing page, the preference form and the house guide during someone's stay.

## 2026-11-07 — the cleaning fees were silently reverting, and tightening them exposed five crashes

The live store refuses reads, so I went looking for what else a read failure quietly changes. `loadExtraCleaningFees` caught **every** error and returned the defaults. A store at its daily read limit therefore reverted every extra cleaning fee to the stand-in values, with no flag set and nothing on any page saying so — the same shape as the fabricated dashboard, one layer down.

It now raises when the failure is a limit or a pause, and still falls back only for a malformed value, because that is a data problem and the defaults are the safe answer there.

That fix then exposed the cost of not having done it earlier. Six call sites read those fees, and only one was guarded. With the swallow removed, five would have thrown where they used to return defaults — swapping a silent wrong number for a Cloudflare 1101, which is worse, and in one case a **write**: `/api/portfolio/extra-cleaning` merges the current fees before saving, so reading defaults and saving them would have overwritten the real fees with stand-ins.

So I walked every route that reads the ledger against a store that refuses reads, and fixed each:

| Route | Before | Now |
|---|---|---|
| `/api/portfolio/metrics` | 200 with seed figures | 503 and a reason |
| `/api/portfolio/history` | threw, or a stand-in | 503 and a reason |
| `/api/portfolio/extra-cleaning` | would have **overwritten the fees** | 503 and a reason |
| `/api/agent/briefing` | threw on the cache read, before my guard | 503 and a reason |
| `/api/automation/run` | unhandled throw | 503 and a reason |

The briefing one is the useful catch. I guarded the fees read first, and it still threw — because the **cache read above it** also hits the limit, and I had put my guard below it. A walk of all five routes found that; guarding the one call site I happened to be looking at would not have.

All five are now a test that runs the real handlers against a store at its limit and requires a status and a sentence, with the failure message naming Error 1101 so the next reader knows why it matters.

## 2026-11-07 — the dashboard was showing fabricated books as if they were real

Chasing last turn's outage led to something worse than the outage. One live route still answered — `/api/portfolio/metrics` — so I read it and found `storageReads: paused` alongside **75 stays and 25 expenses**. The real books are 86 stays and 463 expenses. The seed set is exactly 75 and 25.

So the dashboard was showing **stand-in data as the real ledger**, with numbers that reconcile, and no indication on any screen. `storageReads: 'paused'` was set by the route and read by **no component in the app**: a grep for the flag across `src/**/*.tsx` found nothing.

The route's own comment says the seed set exists so the page "can be judged before live data is connected". That is reasonable for a demo and indefensible for a ledger. An unreadable store and a healthy one holding different money looked identical, and the owner had no way to tell which they were looking at. This is the worst shape a bug can take on this branch: the page loads, the totals add up, and they are not your books.

A paused read is now a **503 with a sentence** — "Saved bookings and expenses could not be read just now, so no figure is shown. Nothing was written over them." — and none of the money fields are returned at all. The dashboard catches it and renders "Saved bookings could not be read. This page is not using a stand-in list."

I checked the rest of the tree for the same pattern: `seedReservations()` and `EXPENSES.map` appear nowhere else, and the one other route that swallows a store failure (`agent/briefing`) returns an empty line rather than invented figures.

The live site may still be in this state right now, because the fix is in this branch and the branch is not deployed. If production's `metrics` answers `storageReads: paused`, the dashboard you are looking at is showing seed numbers.

## 2026-11-07 — the live site was an old build that crashes, and nothing checked that

The books check failed with a 503, so I diagnosed it properly instead of assuming.

What the live site actually is:

| Finding | Evidence |
|---|---|
| Error 1101, "Worker threw an unhandled exception" | the 500 bodies on `/api/reservations`, `/api/surveys`, `/api/pricing/snapshots`, `/api/guest-guide` |
| **10 of 19 routes are not deployed at all** | they answer with the SPA's HTML: `/api/book/availability`, `/api/book/requests`, `/api/market/overview`, `/api/clean/links`, `/api/owner/links`, `/api/pricing/push-plan`, `/api/pricing/approved-rates`, `/api/pricing/shadow-days`, `/api/clean/progress`, `/api/expenses/archive` |
| The build predates the route registry | live `/api/agent/map` reports **zero** documented routes |
| The build predates this session | live `llms.txt` is 2.8 KB and names none of the routes built today |

Run against the same four crashing routes with **no env at all** — the worst a stale deploy can present — this branch answers 401 with a readable reason on three and 200 on the fourth. None throw. So the 1101s are the old code's failure to handle a missing or renamed binding, and this branch already fixes them.

I also caught myself misreading evidence. I first reported `/api/book/availability` as working because it returned 200 — but it returned 200 **with the app's HTML**, because the Function is not there. A 200 is not a success when the content type is wrong. That is exactly the kind of check that fails to find a problem, so I wrote the check instead of trusting the reading.

Three things now exist so this cannot be missed again. `scripts/check-deployed.mjs` asks the live site questions whose answers are knowable from the branch — does it document routes, does `llms.txt` name them, does an API path answer JSON rather than HTML, does a private route refuse with a reason rather than a 5xx — and it now runs as the last step of `npm run deploy`, so a deploy that lands stale or broken fails loudly at the moment it happens. `scripts/list-live-routes.mjs` prints deployed-versus-missing for 19 routes, which is how the table above was built. And the existing source-level checks stay as they were: they were never wrong, they just could not see the gap between the source and what was live.

The fix is to deploy this branch. Nothing here needs a code change to production behaviour; the branch is correct and the live build is not.

## 2026-11-07 — the timeline said nothing was ever sent, beside a sender

The message timeline opened with *"Nothing is sent"* — three times across the panel. That was literally true for the whole life of this branch. It stopped being true an hour before, when the stay message sender landed on the same page. So `#/guests` showed a panel asserting a capability was absent directly beside the control that provides it.

The host panel now says what is accurate: the switches mark what the desk intends to send, nothing here sends on its own, and a message goes out by hand from a stay card. The guest's phone keeps its own line, because there is no send control there and "nothing on this phone sends one" is true.

I also caught myself writing a claim I could not support. My first draft said the switches "decide what is offered on each stay card below". They do not: they are saved in this browser and the sender never reads them. The copy now says they mark intent and do not stop the sender, which is what the code actually does. Making that true would be a separate feature, and inventing the claim first would have been the same mistake as a stale count.

A test reads the real component and fails if it ever claims a message is never sent while a sender exists on that page. I confirmed it goes red on the old wording.

### A production outage, not mine

While checking the books, `/api/expenses` returned 503 and `/api/reservations` 500 on the live site, while `/api/book/availability`, `/api/market/overview` and `/api/agent/map` returned 200. Every route that reads the `SETTINGS` binding failed; every route that does not, worked. `/api/clean/progress` returned the SPA's HTML rather than JSON, which is what happens when a Function does not run at all.

Nothing of mine is deployed: `HEAD` matches `origin/elite-rebuild` and all 386 changes are uncommitted. Run locally against an in-memory KV, both routes answer **200 with real rows** when a host cookie is present, and **401 with a readable reason** when no password is set. So the branch is fine and the live failure is external — most likely the KV binding or the Pages runtime. Worth checking the Cloudflare dashboard: if the SETTINGS namespace was deleted or unbound, every private route goes down while the public pages stay up, exactly as seen.

## 2026-11-07 — declining had the same one-click email

Accepting was not the only ungated action. **Declining also emails the guest**, and it does something accepting does not: it lets the hold go at once, so those nights are free for another guest to take before anyone notices the mistake.

Both halves now ask first. The agent's `decline_request` returns `pendingApproval` naming the reason and the fact that another guest can take the nights, and runs only on a second call with `confirm: true`. The host's decline button asks the same way, naming the request, the reason, and that the hold lets go immediately.

I checked in the browser that dismissing either dialog leaves the state untouched — no booking, no decline, buttons still there.

This closes the class rather than the instance. After the accept fix I went looking for other one-click sends on this desk and found exactly one, which is the right number to find when you look.

## 2026-11-07 — accepting a request booked a stay and emailed a guest on one click

Following the agent's new booking-desk actions, I checked the one property they depend on: does accepting a request email the guest, and is anything asked first?

It emails. With Gmail connected, the accept route posts to Gmail's send API — a real confirmation to a real guest. And nothing asked. A single click on a button sitting directly under a payout field booked the stay **and sent that email**, and neither can be undone from the page. The agent's version did the same in one tool call, which is worse: a bot decided, and a stranger's inbox got the result.

I had written "for destructive actions, require explicit user confirmation" into the agent's instructions several turns earlier. Accepting a request was not covered by anything that enforced it. A rule in a prompt is not a gate.

Two gates now. The agent calls `accept_request` and gets back what would happen — the request, the payout, and the fact that the guest will be emailed — with `pendingApproval: true` and nothing run. It has to call again with `confirm: true`. `confirm` must be exactly `true`; a string, a 1, or a null is not a yes, and a test pins that. The host's button now asks first too, naming the house, the dates, the party, the payout, and saying the stay is saved and the guest emailed with neither undoable from there.

I checked in the browser that dismissing the dialog leaves the booking count unchanged and the buttons intact — a confirmation that still books would be worse than none.

## 2026-11-07 — the Co-host could not answer a booking request

The Co-host could create a stay directly, and could draft a guest message — but it could **not see or answer a saved direct request**. That is the job a person actually does at this desk: read what came in, decide, and either accept it at a price or decline it with a reason. The AI half of the platform had every power except the one the business runs on.

`manage_operations` now has `list_requests`, `accept_request`, and `decline_request`. Listing shows each request with the payout to accept at, computed the same way the desk computes it.

The agent's accept calls **the real desk route**, not a copy of it. That matters: reimplementing accept inside the tool would let the agent's rules drift from the desk's, and a host would see two different answers to the same request. Every refusal a person gets, the agent gets — a clashing night, a second accept, a payout that is not a number.

Two refusals are specific to the agent. A payout is **required**, and an accepted request without one is refused with "call list_requests first and copy the payout from the request line", so nothing is booked at zero. And a decline reason must be one of the six the desk offers.

One thing nearly shipped broken. The desk routes are host-only, so the first version of the agent's accept was refused **401** — the tool looked present and did nothing. It now carries the host cookie built from the deployment's own password, so the agent gets exactly the host's authority and no more. When no password is set there is no cookie, the route fails closed, and the agent is told why rather than silently failing. A test pins that.

Eight tests drive the real tool, including the ones that matter: no booking at zero, no booking over a clash, no second stay from a second accept, and no invented decline reason.

## 2026-11-07 — a guest message pointed at a page that was switched off

The week-before note ends with *"The house rules are on your stay page."* When the guest app is off for that house, that page answers **403 — "The guest app is off for this house."** So the message sent the guest to a dead end, and it would have gone out that way because the timeline had no idea whether the app was on.

The sender now checks. When the app is off, a message that points at the stay page is refused with a reason that says so, and the desk is not offered it at all. A message that does not need the page — the arrival note about parking and the way in — still goes, because refusing everything would be too blunt.

This matters more than it looks on this branch: the Ranch and River guest apps are **still off** in production. Without this guard, the first week-before note sent from the new sender would have told a guest their house rules were on a page that refuses to load.

I also checked two pairs that should agree and do. Todd's statement matches the internal report to the cent for September, October, and November — revenue, management fee, and his share on each house — and the house figures sum to his total exactly. And a cancelled stay produces no clean job, so nobody is dispatched to a house the guest is not in.

## 2026-11-07 — the guest messages could finally be sent

The stay timeline was preview-only for the whole life of this branch. A host could read the eight messages a stay would receive — the confirmation, the week before, the night before, arrival day, the mid-stay note, checkout morning, the review ask, and the come-back note — and **no button ever sent one**. The panel said "Nothing is sent" and that was literally true, for ever.

`POST /api/stay-guide/<token>/stay-message` sends exactly one, by hand. Nothing is scheduled, because a sender that fires on its own would email a guest at the wrong moment with nobody watching, and "checkout is tomorrow" is a judgement about a real house.

Four rules, each guarding a specific way a guest email goes wrong:

- **The day has to be right.** Each message has a window measured from check-in or checkout. A week note sent sixty days out would say "a week until your stay" on the wrong week; a review ask before the guest has left is worse. A refusal names the day the message is for and says nothing was sent.
- **Never twice.** A message already sent for that stay is refused, and the desk lists what has gone.
- **No price, no code, no password.** These messages deliberately *mention* the door code to say it is not included, so banning the word would block every one of them. The guard looks for a code **given as a value** — "the door code is 4412", "code: 4412#" — not the word itself. My first version banned the word and would have made the whole feature unsendable; a test now requires every real message to pass its own guard.
- **The stay comes from the guest record, not the request.** A caller cannot pass dates and have a message judged against the wrong stay.

The send is recorded only after it actually went, so a failed email is not remembered as delivered.

Two things went wrong while building this. A message id I had not accounted for — the come-back note — crashed the sender with a missing window; a missing window is now a refusal rather than a crash. And I overwrote a live route while creating the file: `stay-guide/<token>/message.ts` is Nora texting Brandon when a guest asks something. I restored it from git, confirmed the file is byte-identical to before, and put the new sender at `stay-message.ts`.

## 2026-11-07 — "nobody answered" on a request that could still be answered

The guest request page told a guest whose hold had run out: **"The hold on these dates has ended and nobody answered in time. Send the request again and we will pick it up."**

Both halves were wrong. The host could still accept that request — verified: accepting it returned 201 and wrote the stay. So "nobody answered in time" was a claim about a decision that had not been made. And "send the request again" invited a duplicate for the same nights, which is how a desk ends up with two requests for one stay and one of them silently unanswerable.

The wording now says what is true: the short hold ended, the request is still with us and can still be accepted, so there is no need to send it again — but the dates are no longer held. The button reads "Check these dates" rather than "Send the request again", because the useful action is seeing whether they are still open, not filing a second request.

The host now learns the other half. Accepting a request whose hold had already ended carries a note saying those nights were **never actually reserved**, so another guest could have asked for them in the gap. A live hold produces no note. A request with no hold at all gets its own warning, because "never held" and "held and released" are different stories.

The double-booking itself was already prevented — the clash check catches it, and a test now pins that: accept the expired request, then the fresh one, and the second is refused at 409 with one stay on the books. The bug was never the data. It was two sentences that described a system that did not exist.

## 2026-11-07 — the docs described a page that no longer existed

Adding the `cancelled` state to the guest request page left two documents stale. `llms.txt` and the agent map — the two files a bot reads before it calls anything — both still listed four states, so a bot would have expected a cancelled booking to read as `expired`. That is the exact bug that had just been fixed in the code.

Both now list all five. The split description was stale too: it still said the two-house payout follows "each house's own quote" when it now follows lodging, which is the difference that made $121 land on the wrong house.

A test now reads the states out of the `RequestStatus` type and requires each one to appear **in the sentence that enumerates them** in both documents, and requires every state to render a non-empty line. That last part matters: a state with no wording would render blank on a guest's page.

Getting the test right took three attempts, and the failures were instructive. The first version searched the whole file for the word `cancelled` and passed while the doc was stale, because the word appeared elsewhere. The second anchored on "It answers", which matched `llms.txt` but not the map, whose sentence is phrased differently. Only the third — anchoring after the route path — covered both. I checked each version by reverting the doc and confirming the test went red, which is the only way to know a guard works.

## 2026-11-07 — the desk said every request had an answer when eight did not

The request inbox shows at most twelve rows so the desk stays readable. Two things followed from that cap, and both were silent.

The summary was computed from the twelve rows on screen. Twelve answered requests plus eight hidden waiting ones produced **"All 12 requests have an answer. Nothing is booked."** — while eight guests had no reply and nothing on the page said a backlog existed.

And the cap kept the **newest** rows. The route saves requests newest-first, and the list took them in that order, so a full desk dropped the *oldest* requests — the ones that had waited longest and were likeliest to need an answer before the dates passed.

The list is now ordered oldest-first, so the cap drops the least urgent. The summary counts what is hidden and says so plainly: *"8 more are not shown on this list. Open the older requests to answer them."* It never folds those into the waiting count, because their state was not read — only their number is known. A negative or nonsense count is not treated as a claim.

Verified through the real route with twenty saved requests: the oldest is shown first, and the summary names the eight it could not show.

## 2026-11-07 — the board ignored the price the host had approved

`buildMarketBoard` read only the published rate card. Every consumer builds from it: the market page, the shadow run, and the push plan. So a night the host had approved was invisible to all three. The push plan kept proposing the raise the host had already made — `2219 → 2397` on a night already at 2397 — and the market page showed the old card price beside a guest page showing the approved one.

The board now takes the approved sheet and starts each night from what that house actually asks. A night with no approval still starts from the card, so nothing else moves. Both the push-plan route and the market overview pass the sheet the same way the guest quote does.

The daily 8% cap still applies, measured from the approved price rather than the card. That is deliberate: the cap stops a price jumping in one day, and stacking it on a stale base would have let a night move 16% in two days while each step looked legal.

Three tests pin it, and I confirmed they fail without the fix by reverting the one line and re-running: 2 of 3 went red. That matters here because the earlier version of this code was *plausible* — it read a real price and moved it by a legal step. It was simply the wrong price.

The local preview had the same gap in its own fixture, so the board it served still showed the card. That is fixed too, which is how the browser check could confirm 2,397 for the approved night and 2,219 for the one beside it.

## 2026-11-07 — the Co-host could double-book a house

The Co-host agent's `manage_reservations` tool could `create` a confirmed stay with **no clash check at all**. The human accept path refuses a night already on the calendar; the agent wrote straight into the store. Verified against a real run: a second River stay overlapping an existing one was saved, and the house was double-booked.

An AI teammate is not less dangerous than a person here — a double-booked night is a double-booked night, and it comes with a guest who has been told they have a room. A `create` now checks the same calendar the accept path checks, refusals name the clashing nights, and nothing is written. A back-to-back stay that merely checks out on the arrival day is still allowed, a cancelled stay no longer blocks the nights it gave up, and a calendar block stops the agent exactly as it stops a person.

Six tests drive the real tool, including the boundaries that would make the guard too strict: a different house must not be refused because of a stay elsewhere, and a checkout-day arrival must not be read as a clash.

That last one is worth noting. My first version of the test asserted a Ranch booking on Dec 16–19 should be allowed, and it failed — because the seeded calendar genuinely has a Ranch stay on Dec 18–21. The guard was right and my test was wrong. I moved the test to a range the seed leaves empty rather than weaken the check.

## 2026-11-07 — the two-house payout landed on the wrong house

The desk showed River $5,625 / Ranch $1,623 for a 30-guest party. The accept path wrote River **$5,503.64** / Ranch **$1,744.36**. Same total, $121.36 on the wrong house — and per-house revenue is what the owner statement and the 50/50 split are built from.

The cause: the split weighted each house by its **guest total**, which includes the cleaning fee, while the figure being split is the **host net**, which does not. Cleaning is $600 at the River and $350 at the Ranch, so the two proportions could not agree. The desk and the accept were reading different quantities and each looked correct on its own.

The split now weights by **lodging**, which is exactly what a payout is. For this party the two figures agree to the cent, and a regression test writes a real accept through the route and asserts every stored payout equals the number the desk showed for that house. Both sides also read one shared party-split function now, so the divide cannot drift again even if the capacity changes.

An earlier fix had already made the split proportional rather than even, because a party of 30 puts 25 in one house and 5 in the other. That was right, and it was still wrong: it split the right total by the wrong measure.

## 2026-11-07 — the desk shows what to accept a request for

The request inbox asked the host to type a payout with **no price anywhere on the screen**. The guest had already been quoted a figure on the booking page, and the person deciding had to guess it or go look it up. That is how a direct booking gets recorded at a number nobody agreed to.

Each request now shows the guest total and the payout, computed from the same quote code the guest page uses and against the same approved sheet. The payout field is pre-filled with that figure, so accepting is a check rather than a guess; the host can still type something else.

The two numbers are deliberately different and both are named: the guest total carries the cleaning, and the payout does not. Showing only one of them was what made the guess ambiguous in the first place. A stay that cannot be priced leaves the field blank with a line saying to type it, because a made-up number is worse than an empty box. A two-house party shows one row per house, split by the same party split the accept path uses, so the desk never shows a River figure for what will become two bookings.

If the approved-price sheet cannot be read, the line says the figure may not be what the guest saw rather than presenting a card price as fact.

## 2026-11-07 — a restore now actually restores the receipt

The archive I built an hour earlier was wrong in a way the tests did not catch. It archived the row and then **deleted the receipt file from storage**, which is what the old delete did. A restore then put the row back pointing at a file that no longer existed: the page said the expense was back, the amount was back, and the receipt was gone. The archive made a restore *look* complete while quietly losing the thing it was meant to protect.

The delete no longer touches storage. The bytes stay until a host purges the archived row on purpose, which is now the only place a receipt is deleted. Purging takes a second deliberate act on a row already off the books, and it confirms by name first, so losing a bill can no longer happen in one mistaken click. A live expense cannot be purged at all: it has to be removed, which archives it, so there is no path that skips the archive.

A test now stubs the storage delete and fails if a remove ever calls it, then asserts the receipt bytes are still readable after a restore. That is the test that would have caught the original mistake.

## 2026-11-07 — a deleted expense can be put back

Deleting an expense was permanent. The route removed the row from the ledger and then deleted the receipt file from storage, so a mistaken delete lost the row and the receipt with nothing to recover from. The objective for this branch is explicit that expenses and receipts must not be lost, and a host-only guard does not make a destructive write safe for the host.

A delete now writes the row to an archive first, then removes it. If the archive write fails, the delete does not happen and the expense stays on the books, so the failure mode is a refused delete rather than a lost bill. The archived row is kept exactly as it was, including its receipt storage path and item photos, and a restore puts it back unchanged.

The archive is not a second ledger. Nothing counts it: no report, no statement, no owner share, no P&L. The line above the list says that on the page, because a removed row that still showed an amount could be misread as a live one. A receipt path is not published either; the desk only learns whether a receipt exists.

The panel below the household ledger lists what can be restored, with when and why it was removed. The count in that line is taken from the rows on screen, not from the server sentence: in the first cut those two disagreed after a restore, so the list emptied while the line still said one expense could be restored. A restore also refuses rather than duplicating a row that is already back on the books.

## 2026-11-07 — a cancelled stay is not an unanswered request

The guest request page I built an hour earlier had a wrong state in it. `getAllReservations` leaves cancelled stays out, which is right for a calendar, so a stay that was accepted and then called off fell through every branch and the guest was told *"nobody answered in time."* Somebody did answer: we took the stay and then cancelled it. A cancelled stay now has its own state, its own wording, and a way back to the booking page. A two-house party is covered too: cancelling one house does not hide the other, so a live stay still reads as confirmed.

## 2026-11-07 — five more routes failed open, and the check that missed them

`/api/book` is public in the middleware, so every booking route relies on its own guard. Five of them used `isAuthenticated`, which returns **true** when `DASHBOARD_PASSWORD` is unset. Production has no password set right now, so against the live site:

- **`GET /api/book/requests` answered 200 to an anonymous caller** — verified against production before the fix. That is every direct request with the guest's name, email, phone, and note.
- **`POST /api/book/accept` would create a booking** from any request, with no credential.
- `GET/POST /api/book/holds` listed and released holds.
- `POST /api/owner/links` minted Todd's read-only statement link.
- `GET/POST /api/pricing/shadow-days` read and wrote the pricing clock.

Two more leaned on the same check for something worse. The door-code preview (`?preview=1` on a stay guide) would hand over the River Wi-Fi password and door code to anyone with a stay link, and the host reply into a guest thread would let a stranger post as the host. Both are fixed the same way.

All seven now use `hostOnly`, which checks a bot bearer first and then fails closed when no password is configured.

The root cause was the pre-deploy check: it counted `isAuthenticated(` as a valid guard. So a route that looked guarded and opened on an unconfigured deployment passed every gate. The check now rejects it by name, and only `auth/session.ts` is allowed to read the cookie directly. It also inspects `_lib/guest-concierge.ts`, where the guest guide actually decides about the door code, because that file is not a route and the file walk would not otherwise see it.

Five tests now drive the real check against a fixture tree, so a future edit that weakens it fails. Another seven call the real handlers with an env that has no password and assert 401, including one that asserts no door code or Wi-Fi password comes back.

## 2026-11-07 — a guest can see where their request stands

A guest who sent a direct request got a receipt and then silence. There was no page, no link, and no way to tell "a person is reading it" from "this was declined two days ago". The only way to find out was to reply to the email and wait again.

Every request now mints its own token, and `/request/<token>` shows that guest where things stand: waiting, confirmed, declined, or expired. The token is the whole credential, so there is nothing to sign in to, and it is the only thing the route accepts, so nobody can read someone else's request. The receipt email carries the link, and the booking page shows it right after a request so a guest who closes the tab can still find it.

The page is deliberately thin. It returns the dates and the party and nothing else: no name, no email, no phone, no host note, no internal id, and no price. A forwarded or leaked link therefore exposes nothing that was not already on the public booking page. A decline names a plain reason and offers the booking page again; an expired hold says the dates are free and offers to send the request again, rather than showing a clock that already passed.

An accepted request is matched to its stay by the request id written into the stay note, not by dates. That matters: another guest's stay covering the same nights must not make this guest read "confirmed". A cancelled stay does not count either, and a released hold is not shown as live.

Two claims on the host board and the public pages also had to change. They said the page "does not hold the dates", which stopped being true when the 30-minute hold landed. They now say the page holds the dates for 30 minutes and does not charge a card, which is what actually happens.

## 2026-11-07 — an approved night reaches the guest price

Every piece of the pricing engine fed the host board and stopped there: comps set the band, the band fed the shadow run, and the shadow run fed a push plan that by design has no writer. A guest still paid the static rate card, so the whole chain moved a price nobody was charged.

`POST /api/pricing/approved-rates` is now the one door from the engine to a guest. A host approves one night's price from the push plan, and that night is quoted at that price on our own page and in the guest month grid. The route fails closed: it needs the host, it refuses a night that is booked, closed, held, or paused, and it refuses a price outside the floor, the ceiling, the 8% raise cap, or the published 20% promotion. A raise and a cut are judged differently on purpose — the 8% cap exists so a price cannot jump in one night, and a promotion is a deliberate 20% move, so capping a cut at 8% would have refused every promotion the engine proposes.

The month grid and the quote read the same sheet, so a guest cannot see one price on the calendar and a different one in the total. Before that, the grid still showed the card while the quote showed the approved price. A booked night keeps its price even when the sheet names it, and a sheet that cannot be read is null on the wire rather than an empty list, so a stand-in is never shown as approved. Approving does not push to Airbnb, VRBO, or Hospitable, and nothing is charged.

## 2026-11-07 — the co-host chat and the transcriber answer only a host

Two routes that take actions had no guard of their own and relied on middleware that opens everything when `DASHBOARD_PASSWORD` is unset. The Co-host chat can log an expense, create a stay, and block a calendar; the builder chat writes partner spend and phases; and the transcriber spends an OpenAI key on any caller. All three now fail closed the same way the ledger does, so an unconfigured deployment closes them instead of publishing them.

The pre-deploy check only knew the routes it was told about, which is how those three sat outside it. It now walks `functions/api`, requires every route file to be named as a host route, a guest route, or a public one, and fails on any file nobody classified. Adding a route now forces a decision about who may call it. That is 65 host routes, up from 60.

## 2026-11-07 — Todd can open his own statement

`#/owner` can make a read-only link for Todd. The link opens `/owner/<token>`: the Ranch and River share after the fee, each house’s stays, host payout, costs, and Todd’s share, and the month lines. Lindon, household, and construction stay off. The page has no download, no edit, and no guest names; a link that is not saved says so and shows no figure. Making a link does not email it. Nothing is booked, and a saved expense is not changed.

## 2026-11-07 — the host desk reads the direct requests

`#/guests` lists the requests saved by the booking page. Each row names the houses, the dates, and the party, and says whether those nights are already on the calendar. A name, a note, and a price stay off. A request older than two days is named. Nothing is booked, held, or answered, and the panel says it could not read the list rather than showing an empty one.

## 2026-11-07 — Nora on the stay phone follows both calendars

When the saved party count needs both houses, Nora on the stay page follows the River House and the Ranch House for early and late and for these dates. The count comes from preferences or the booking note. Nothing is sent.

## 2026-11-07 — the co-host brief uses the same-day clock

When two houses check out on the same day, the co-host brief uses the cleaner clock. A River House turn is not one route with a house in Lindon. Ranch and Lindon can still fit one after the other. Nothing is sent.

## 2026-11-06 — a house page marks both houses

When the party needs both houses, the house page marks a night booked or closed at the River House or the Ranch House. The rate card uses the River House rules. A party that fits one house stays on that house. Lindon stays off that month. Nothing is held.

## 2026-11-06 — the co-host brief names each house checkout

The co-host brief keeps the shared checkout list and adds the River House toilet-paper step and the Ranch House hot-tub cover. The Lindon House keeps the shared list. Nothing is sent.

## 2026-11-06 — a two-house request names both houses

The request for a party that needs both houses names the River House and the Ranch House: each address, each arrival line, and each parking line. Nothing is held.

## 2026-11-06 — the stay phone uses the published arrival, parking, and emergency lines

A saved arrival, parking, or emergency line that only repeats part of the published guide is replaced by that guide line. A saved line that adds something stays. Nothing is sent.

## 2026-11-05 — a canyon turn is not one route with Lindon

A 1:00 PM arrival and a 2:00 PM leave can still fit one after the other when both houses are in Lindon. A River House turn on that same day is not treated as that fit. The drive up Provo Canyon is not in the clock. Nothing is booked or sent.

## 2026-11-05 — the stay phone lists the published house rules

The stay phone shows the published house rules. A saved line that only repeats part of a published rule stays off that list. A saved line that adds something stays. Nothing is sent.

## 2026-11-05 — a two-house quote lists lengths both houses can take

A party that needs both houses can choose a length. The list stops at the first night booked or closed at the River House or the Ranch House. Choosing a length does not send a request. Nothing is held.

## 2026-11-04 — a two-house quote lists the other house

A party that needs the River House and the Ranch House together lists the other house on the quote: sleep count, check-in, check-out, address, arrival, parking, and the photo caption. Nothing is held.

## 2026-11-04 — a house card names the stay and the photo

Each house card names the sleep count, check-in, check-out, and the photo caption. The River House card says the picture is a listing rendering. Nothing is held.

## 2026-11-04 — a two-house date field uses both calendars

The check-in field and the checkout field on a River and Ranch quote stop on a night booked or closed at either house. A night booked only at the Lindon House stays off those fields. Nothing is held.

## 2026-11-04 — a two-house month marks either house

When the quote is the River House and the Ranch House together, the month marks a night booked or closed at either house. A night booked only at the Lindon House stays off that month. Nothing is held.

## 2026-11-04 — a month on the year grid shows on the rate card

Choosing a month on the house page’s next 12 months shows that month on the rate card. The dates on the page stay. Nothing is held.

## 2026-11-04 — preference chips follow the published guide

The preference chips are the amenities that house publishes: the river, the hot tub, the fireplace, Sundance, and the garage when the guide names them. Nothing is sent until the form is sent.

## 2026-11-04 — a checkout question uses the published step

A question about the trash, the towels, the dishwasher, or the fireplace uses that published checkout step. Extra words stay out of the match. The step does not start a new quote. Nothing is sent.

## 2026-11-04 — a parking question keeps the published line

A parking question that adds extra words, such as “these nights,” still uses the published parking line. Park City stays on a Park City question. The line does not start a new quote. Nothing is sent.

## 2026-11-04 — arrive at 1:00 and leave at 2:00 use the request

Asking to arrive at 1:00 uses the early-arrival request for the dates on the page. Asking to leave at 2:00 uses the later-checkout request. A booked night before check-in keeps the early arrival off. A booked checkout morning keeps the later leave off. The public page leaves the door-code timing off. Nothing is sent.

## 2026-11-04 — a booked event start stays off the quote link

The market event list and Todd’s event list use the booking calendar once it has been read. A start that is already booked is named and stays off the quote link. The River House can still quote that event when its own nights are free. Until the calendar is read, the list does not say which nights are booked. Nothing is posted and nothing is charged.

## 2026-11-04 — a party, a sleep count, septic, and a first stay stay on the published line

The stay phone and the house search use the published party line, the published sleep count, the published septic note, and the River House first-stay date. A numbered guest count stays on the fit line. A house that does not publish a septic note or a first-stay date says so. Nothing is sent.

## 2026-11-04 — the market board reads the overview

The market board uses the overview when the response is JSON and the comp set is the default list. A pinned or hidden comp stays on the set saved in this browser. A page that is not JSON stays on the sample board. Nothing is posted, and no rate is written.

## 2026-11-04 — published facts stay on the guide answer

A bedroom count, the airport, and the quiet-hours schedule use the published line. The River House does not gain an airport drive time or a quiet-hours clock. A Sunday meal question leads with the published Sunday note. Nothing is sent.

## 2026-11-04 — the stay photo keeps its caption

The stay phone, the trip paper, and the printed house guide name the listing image. The River House says it is a listing rendering. Ranch and Lindon stay “Listing photo.” The caption has no price and no door code. Nothing is sent.

## 2026-11-04 — the River preference form stays on the published guide

The River preference form follows the published guide through the last step. A theater night and a popcorn choice stay off the form and off the staff card. Nothing is sent until the form is sent.

## 2026-11-04 — the house page shows the next 12 months

The house page marks booked nights and calendar blocks for the next 12 months. A blank night still needs a quote. Nothing is held.

## 2026-11-04 — a saved request keeps the guest count

A request is saved only when it names the overnight guests. One request for two houses is the River House and the Ranch House. The count is stored with the request. Nothing is sent from this check.

## 2026-11-04 — a visitor question stays on the occupancy line

A visitor question on the booking page and the stay phone uses the published occupancy line: the stay is for the guests on the booking. It does not invent a day-guest rule. Nothing is sent.

## 2026-11-04 — the share line names why the stay is blocked

The share line and the two-house agreement name the guest count or the reason the stay is refused. Nothing is sent.

## 2026-11-04 — arrival times name why they are off

Arrival and departure times stay off until this page can quote the stay. When the dates are already on the page, those lines name the guest count or the reason the stay is refused. The stay agreement names that same reason. Nothing is sent.

## 2026-11-04 — the stay phone shows the preference card

The stay phone shows this stay’s preference card. A saved hot tub stays on the Ranch card. A sauna, a fire pit, a pet, and a phone number stay off that card. Nothing is sent.

## 2026-10-31 — the preference form follows the published guide

The preference form follows the published guide for that house. A house that does not list a hot tub, a sauna, a fire pit, or a pet rule does not ask for one. Nothing is sent until the form is sent.

## 2026-10-31 — a shared quote keeps the stay

A shared quote keeps the house, the dates, and the party. It does not hold the dates. Nothing is sent.

## 2026-10-31 — both agreements stay off until both houses can be quoted

- A party that needs Ranch and River does not get those agreements until both houses can be quoted. Nothing is sent.

## 2026-10-31 — the stay phone can save this stay

The stay phone can save this stay on a calendar. The file is the stay on the phone. It does not change the reservation. Nothing is sent.

## 2026-10-31 — the house list follows the stay

Once the calendar is read, the house list says whether a 1:00 PM arrival and a 2:00 PM leave are requests for the stay on the page. A booked night is named. Nothing is sent.

## 2026-10-31 — the house month names a discounted night

When the party fits the house, a discounted night on the house month says 20% off once the calendar is read. The nightly price stays off that month. A party that needs both houses leaves that mark off. Nothing is sent.

## 2026-10-31 — a two-house quote includes the trip paper

When both houses can be quoted, the booking page includes a trip paper for the River House and the Ranch House. It names the dates, the address, and the checkout steps. This stay is not booked. Nothing is sent. The door code stays off that paper.

## 2026-10-31 — a two-house quote lists each house’s messages

When both houses can be quoted, the booking page lists the messages a booked stay at the River House and the Ranch House would receive. The list is the time and the subject. This stay is not booked. Nothing is sent. The door code stays off that list.

## 2026-10-31 — the stay phone lists its notes

The stay phone lists the notes this stay would receive, from booking through the next season. The list is the time and the subject. Nothing is sent. The door code stays off that list.

## 2026-10-31 — a fire question stays on the emergency line

A fire, medical, or danger question stays on the published emergency line. A fireplace question stays on the checkout step. A question about whether the river is safe stays on that house’s published line. Nothing is sent.

## 2026-10-31 — the house page follows the two-house quote

A house page with a party that needs both houses uses that quote once the calendar is read. Dates those houses can quote keep the same link. A stay that is too short links the longer stay and leaves the dates on the page. A booked stay stays on those dates. Nothing is held.

## 2026-10-31 — early and late follow both houses

An early arrival and a later checkout for a party in both houses wait until both calendars are clear. The price stays off. When one house is booked the night before, or on the checkout morning, that request stays off. Nothing is sent.

## 2026-10-31 — a two-house quote leads the page

When Ranch and River can be quoted together, the quote says that and the month marks those nights. The one-house price stays off. The other-house list stays off that page. A stay those houses cannot quote keeps the month unmarked. Nothing is sent.

## 2026-10-31 — a two-house party is not stopped by one house

A party that needs Ranch and River together is not turned away because the River House sleeps 25. The request stays off until both agreements are opened. When those houses cannot be quoted, the hold names that reason. Nothing is sent.

## 2026-10-31 — the group link uses the party on the list

When the house list already has a party, the group link uses that party. A party that fits one house stays on one house. A party of 30 is still the example when the guest count is empty. Nothing is sent.

## 2026-10-31 — the stay phone names this stay

Asking whether these dates can be booked names this stay’s check-in and checkout on the stay phone. The quote search uses the dates on the page. Nothing is sent.

## 2026-10-31 — these dates use the stay on the page

A question about these dates uses the stay on the house list or the house page. Each house says whether those dates can be quoted. Nothing is sent.

## 2026-10-31 — the group link follows the two-house quote

The house list quotes both houses only when a party of 30 can be quoted for those dates. A stay the quote would refuse is named. When the booking calendar could not be read, the link does not call it a quote. Nothing is sent.

## 2026-10-31 — a booked house card names the next stay

The house list and the house page name the next stay a booked or closed house can quote. The dates on the page stay. Nothing is held.

## 2026-10-31 — a blank house list opens on a quotable stay

- A blank house list opens on the same stay the booking page can quote. A blank house page opens on a stay that house can quote. A link that already names dates stays on those dates. Nothing is held.

## 2026-10-31 — a checkout question stays on that step

- A towels, trash, or dishwasher question stays on that checkout step. Asking what to do before leaving lists those steps. Nothing is sent.

## 2026-10-31 — a swim question stays on that house

- A swim question on the Ranch House or the Lindon House stays in Lindon. The River House names the river warning and Deer Creek. A hot-tub question names the published tub rule, or that the house does not list one. Nothing is sent.

## 2026-10-31 — parking and smoking stay on the published lines

- A parking question stays on the parking line. A smoking question stays on the published no-smoking line. Nothing is sent.

## 2026-10-31 — the stay phone waits on a date question

- While the stay phone is still reading the calendar, a question that names two dates says it is checking the calendar. Nora's first line names Lindon for the Ranch House and the Lindon House, and the canyon for the River House. Nothing is sent.

## 2026-10-31 — a booked house names the next stay

- When the dates on the booking page are booked or closed for a house, that house button names the next stay the quote can accept. Choosing the house keeps the dates already on the page. Nothing is held.

## 2026-10-31 — a check-in question stays on the clock lines

- A check-in or checkout question no longer picks up other guide lines that only contain the word “check.” The stay’s dates stay on the check-in and checkout lines. Nothing is sent.

## 2026-10-31 — the quote guide names this stay’s dates

- A check-in or checkout question on the booking page names that stay’s date and the published time. The house page keeps the published time. Nothing is sent.

## 2026-10-31 — a blank page skips a Friday that is already booked

- Once the calendar is read, a blank booking page leaves a booked Friday and opens on the next Friday the quote accepts. A shared link keeps its dates. Choosing another house keeps the dates already on the page. Nothing is held.

## 2026-10-31 — a blank booking page opens on a stay the quote accepts

- The first dates are the next Friday, stretched to the night count that Friday can quote. Thanksgiving and Christmas no longer open on a stay that is too short. Nothing is held.

## 2026-10-31 — Nora places each house where the guide does

- The concierge notes use the published address and arrival. Ranch and Lindon stay in Lindon. The River House stays at Vivian Park in Provo Canyon. Nothing is sent.

## 2026-10-31 — Nora does not receive the door code

- The concierge notes name the day the code appears and do not include the code or the Wi-Fi password. The stay phone's first load leaves both off until the house rules are read and each stay-agreement topic is opened. Nothing is sent.

## 2026-10-31 — a guide question keeps the words the guide uses

- Extra question words no longer hide a published line. Trash and the dishwasher still come from the checkout list. A thing the guide does not name still stays unanswered. Nothing is sent.

## 2026-10-31 — the stay phone names when the code opens

- Asking when the door code opens on the stay phone names that day and does not show the code. Asking for the code itself stays off the phone. The public desk still keeps the timing off. Nothing is sent.

## 2026-10-31 — a party larger than both houses is not saved

- A two-house request uses the same party split as the quote. More than 45 guests, a party with no adult in each house, or a party that fits one house is turned away before it is saved. Nothing is sent.

## 2026-10-31 — a refused stay is not saved

- The booking request checks the same quote before it writes or emails. A booked night, a closed night, a too-soon River stay, and a party that does not fit are turned away. Nothing is sent from this check.

## 2026-10-31 — the quote rhythm leaves the door-code timing off

- The booking page rhythm and the early-arrival line no longer say when a door code opens. The stay phone keeps that line. Nothing is sent.

## 2026-10-31 — the booking page leaves the door-code timing off

- The public quote add-on and the unsent message preview do not say when a door code opens. The stay phone keeps its own line. Nothing is sent.

## 2026-10-31 — the request note includes a guest discount

- A one-house request note includes 20% off when those nights are discounted. Nothing is sent.

## 2026-10-31 — a grocery question stays on the published line

- River uses the published grocery line. Ranch and Lindon say the guide does not name a store. Nothing is sent.

## 2026-10-31 — a hike stays on the outdoors list

- A hike question uses the published outdoors places. A kids outing without a guest count uses the published family places. Nothing is sent.

## 2026-10-31 — the house guide names a booked event start

- A Thanksgiving question uses the booking calendar. A booked start is named. Nothing is sent.

## 2026-10-31 — a booked event start is named

- Once the booking calendar is loaded, an event whose start is booked is named and is not linked. Nothing is charged.

## 2026-10-31 — a meal question stays on the food list

- A question about where to eat uses the published food places for that house. A ski question uses the published ski places. Nothing is sent.

## 2026-10-31 — arrivals wait until the party fits

- The booking arrival list stays off when the party does not fit that house. Nothing is sent.

## 2026-10-31 — both houses name a discounted night

- A party that needs Ranch and River together says 20% off when those nights are discounted. The line has no price. Nothing is sent.

## 2026-10-31 — the stay phone says it is checking the calendar

- Until the booking calendar loads, the stay phone says it is checking. It does not say a night is free. Nothing is written.

## 2026-10-31 — the month names a discounted night

- A night at 20% off says so on the booking month. A booked night does not. Nothing is charged.

## 2026-10-31 — a guest discount says 20% off

- The booking quote names a discounted night as 20% off. The host fill wording stays off that page. Nothing is charged.

## 2026-10-31 — a before-arrival check stays on its page

- Checking a step on the booking page does not mark that step on the stay phone. Nothing is sent.

## 2026-10-31 — an early arrival stays off a booked stay

- When the dates include a booked night, the page does not offer a 1:00 PM arrival or a 2:00 PM leave. Nothing is sent.

## 2026-10-31 — a winter driving question stays on the River lines

- A question about snow or four-wheel drive uses the published River arrival and parking lines. Ranch and Lindon do not invent a rule. Nothing is sent.

## 2026-10-31 — the booking page facts use the calendar

- The booking page and its printed guide follow the dates for an early arrival and a later checkout. The guide does not say the calendar failed. Nothing is sent.

## 2026-10-31 — the house page add-ons use the calendar

- Once the house page has read the calendar, the add-on line follows those dates. The house list no longer says the calendar failed. Nothing is sent.

## 2026-10-31 — the house chooser names the street

- The house list, the house cards, and the booking house buttons show the published street address. The stay trip links that address. A rejected check-in note clears when the house or the dates change. Nothing is sent.

## 2026-10-31 — a check-in date cannot start on a booked night

- The booking check-in field keeps the current date when the new night is booked, closed, already past, or too short to start. Nothing is sent.

## 2026-10-31 — the stay phone uses the booking calendar for early and late

- When saved bookings could not be read, an early arrival and a later checkout still follow the nights-only booking calendar. Nothing is written.

## 2026-10-31 — a checkout date stops before a booked night

- The booking date field holds the checkout on the morning of a booked or closed night. A later date does not stay in the field. Nothing is sent.

## 2026-10-31 — an early arrival uses the night before

- A question about arriving early or leaving later uses the dates on the page. A booked night before, or a booked checkout morning, keeps that request off. An unread calendar waits. Nothing is sent.

## 2026-10-31 — the month names the last checkout morning

- While a checkout is being chosen, the month names the morning before a booked or closed night. A later morning stays off. Nothing is sent.

## 2026-10-31 — a checkout cannot run through a booked night

- The month leaves a later morning off while a checkout is being chosen. The booked morning can still be the checkout. Nothing is sent.

## 2026-10-31 — a directions question names the address and the arrival note

- A question about how to get there names the published address and the arrival note. Nothing is sent.

## 2026-10-31 — the house cards say whether the dates can be quoted

- Each house card on the list says whether these dates can be quoted. The line has no price.

## 2026-10-31 — the guide search names the street address

- A question about the address names the published street address. Nothing is sent.

## 2026-10-31 — the house page leaves a refused party unpainted

- The house quote button names the party reason and stays unpainted. A booked night still says booked. Nothing is sent.

## 2026-10-31 — a party that cannot stay is not offered another house’s longer stay

- A too-short date on another house stays on the party reason. The longer-stay button stays off. A booked night still says booked. Nothing is sent.

## 2026-10-31 — the house buttons say whether the dates can be quoted

- Each house button on the quote says whether these dates can be quoted. The line has no price.

## 2026-10-31 — Nora names this stay’s arrival

- Nora answers an arrive or leave question with this stay’s date. That answer stays on the phone.

## 2026-10-31 — a quiet-hours question says whether they are in effect

- A question about quiet hours right now says whether they are in effect. The River House guide does not name a clock. Nothing is sent.

## 2026-10-31 — a refused party leaves the month price off

- The quote month leaves the nightly price off when the party cannot stay. Nothing is sent.

## 2026-10-31 — a party that cannot stay loses the length list

- A party that cannot stay does not get a longer stay or a length list. Nothing is sent.

## 2026-10-31 — an arrive or leave question names the time

- An arrive or leave question on the stay phone names this stay’s date and the published time. The house page names the published time. Nothing is sent.

## 2026-10-31 — the stay search names this stay’s date

- A check-in or checkout question on the stay phone names this stay’s date and the published time. Nothing is sent.

## 2026-10-31 — a children-only party leaves the arrival price off

- When a party cannot stay, the arrival chips leave the price off. A Ranch or River stay that names only children says a stay needs an adult. Nothing is sent.

## 2026-10-31 — a children-only stay is named for the cleaner

- A next stay or a checkout that names only children says a stay needs an adult. Names stay off that line. Nothing is sent.

## 2026-10-31 — a children-only party is not a request note

- When every overnight guest is a child, the quote does not write that party as the request note. The page still says a stay needs an adult. Nothing is sent.

## 2026-10-31 — an empty house-note list uses the published notes

- When the saved house notes are empty, the stay phone and the trip sheet use the published notes. A saved note still wins. Nothing is sent.

## 2026-10-31 — an empty area list uses the published places

- When the saved area list is empty, the stay phone and the trip sheet use the published nearby places. A saved list still wins. Nothing is sent.

## 2026-10-31 — the stay search names check-in and checkout

- A check-in or checkout question on the stay phone names the published time. A door code stays off that search. Nothing is sent.

## 2026-10-31 — the stay phone searches the published guide

- The house tab on the stay phone searches the published guide. A door code or Wi-Fi question stays off that search. Nothing is sent.

## 2026-10-31 — a two-date answer does not extend into a booked night

- When two dates fail a published rule, the longer stay is left off if it would run into a booked or closed night. Nothing is sent.

## 2026-10-31 — a length question stops before a booked night

- A question about how long a stay can start stops before a booked or closed night. Nothing is sent.

## 2026-10-31 — the rate-card week stops before a booked night

- A free night whose shortest stay would run into a booked or closed night says no start. Nothing is raised.

## 2026-10-31 — the group link waits for the calendar

- While the calendar is still loading, the group link says it is reading the calendar and does not call the stay a quote. Nothing is sent.

## 2026-10-31 — the house button waits for the calendar

- While the calendar is still loading, the house quote button says it is reading the calendar and does not call the stay a quote. Nothing is sent.

## 2026-10-31 — the print note leaves a refused price off

- When the stay cannot be quoted, the print note leaves the price off and the button does not call it a quote. Nothing is sent.

## 2026-10-31 — the share line does not call a refused stay a quote

- When the stay cannot be quoted, the share line reopens the dates and does not call that stay a quote. Nothing is sent.

## 2026-10-31 — a refused stay’s paper names the reason

- When the stay cannot be quoted, the printed guide names that reason and does not ask the guest to open the agreement topics. Nothing is sent.

## 2026-10-31 — the quote headings do not say open

- The arrival list and the other-houses list on the quote no longer use the word open in the heading. The River opening line says the first stays have started. Nothing is sent.

## 2026-10-31 — the occupancy file includes a closed night

- A calendar block is in the occupancy file even when it is not listed as a stay. Names stay off the file. Downloading does not change a booking.

## 2026-10-31 — the market week uses the calendar

- The three-house week marks a closed night even when it is not listed as booked, once the calendar has been read. Nothing is raised.

## 2026-10-31 — the rate-card week marks a closed night that is not booked

- A closed night on the seven-night rate card is marked closed even when it is not listed as booked. Nothing is raised.

## 2026-10-31 — the stay concierge names a closed night

- A question about two dates names a closed night even when that night is not listed as booked. Nothing is sent.

## 2026-10-31 — a guide question names a closed night that is not booked

- A question that names two dates names a closed night even when that night is not listed as booked. Nothing is sent.

## 2026-10-31 — the other-houses line skips a closed night

- The other-houses line uses an arrival that skips a closed night inside the stay. Nothing is sent.

## 2026-10-31 — the nightly text stops a length before a closed night

- The length and add-on lines stop before a closed night that is not listed as booked. Nothing is sent.

## 2026-10-31 — the quote month marks a closed night that is not booked

- A closed night is marked closed even when it is not listed as booked, and that night does not show a price. Nothing is sent.

## 2026-10-31 — the cleaner page does not deny a checkout the job cards list

- When the job cards already list a checkout, the page does not say there are no checkouts. Nothing was booked or sent.

## 2026-10-31 — early and late stay off a closed night

- An early arrival and a later checkout stay off a closed night that is not listed as booked. Nothing is charged.

## 2026-10-31 — a length stops before a closed night

- A length and the full stretch stop before a closed night that is not listed as booked. Nothing is sent.

## 2026-10-31 — an arrival chip skips a closed night inside the stay

- A closed night that is not the check-in still keeps that stay off the arrival chips. Nothing is sent.

## 2026-10-31 — the house quote button does not call a refused stay a quote

- When the stay cannot be quoted, the button is not gold and the line under it does not say the booking page quotes the stay. A stay the page can quote still does. Nothing is sent.

## 2026-10-31 — the house month does not paint a refused stay gold

- The house page month leaves a booked, closed, or not-yet stay unpainted. A stay the page can quote is still gold. Nothing is sent.

## 2026-10-31 — a refused stay is not painted gold

- When the stay cannot be quoted, the selected nights stay on the month without the gold fill. A stay the page can quote is still gold. Nothing is sent.

## 2026-10-31 — the quote month does not call a refused stay the stay

- When the stay cannot be quoted, the month does not call the gold nights the stay. A stay the page can quote still does. Nothing is sent.

## 2026-10-31 — the cleaner page does not call a read list empty

- When checkout mornings can be read, the job list does not also say there are no checkouts. An unread list says it could not be read.

## 2026-10-31 — the stay agreement stays off a stay the quote will not take

- The quote names why the stay cannot be quoted before it asks for the agreement. The agreement topics stay off that stay. Nothing is sent.

## 2026-10-31 — arrival and departure times stay off a stay the quote will not take

- The quote hides arrival and departure times until the stay can be quoted. The share link leaves those times off. Nothing is sent.

## 2026-10-31 — add-ons stay off a stay the quote will not take

- A stay the page cannot quote does not list add-ons. A stay before the River House opens and a booked stay both stay off that list. Nothing is charged.

## 2026-10-31 — the house quote button names the River House opening

- The house page quote button names a stay that starts before the River House opens. It does not offer a longer stay. Nothing is sent.

## 2026-10-31 — the house list names a stay before the River House opens

- A stay that starts before the River House opens is named on the list, the card, and the group link. Nothing is sent.

## 2026-10-31 — the group link names a booked house

- The group link keeps the dates on the house list. When Ranch or River is booked or closed, the link says so. Nothing is sent.

## 2026-10-31 — a house card names a booked span

- Each house card names a booked or closed span for the dates on the list. A free span stays off the card. Nothing is sent.

## 2026-10-31 — the house list names a booked span before a party

- The house list names a booked or closed span before a party is entered. A free span stays off that list. Nothing is sent.

## 2026-10-31 — the canyon line uses checkout mornings

- When checkout mornings can be read, the canyon line uses those mornings. It does not say the list could not be read. Nothing was booked or sent.

## 2026-10-31 — the clean route follows checkout mornings

- When checkout mornings can be read, the route uses those houses. A house with no checkout is left off. Nothing was booked or sent.

## 2026-10-31 — the guide search names a booked span

- The guide search on the quote and the house page names a booked or closed span. A free span stays with the guide. Nothing is sent.

## 2026-10-31 — a quote length does not say the house is open

- When the calendar has been read, a length or a full stretch on that check-in does not say the house is open. Choosing one does not send a request.

## 2026-10-31 — the rate-card week marks booked nights

- When the calendar has been read, the next seven nights mark a booked night or a calendar block. Nothing is raised. Nothing is posted.

## 2026-10-31 — Todd’s card lists Ranch and River checkouts

- Todd’s card lists the next Ranch and River checkout mornings. Lindon is not on that list. This is not the statement. Names stay off the list. Nothing was booked or sent.

## 2026-10-31 — the house guide names a booked date

- When the calendar has been read, a date question names a booked or closed night. It does not say the house is open. Nothing is sent.

## 2026-10-31 — the cleaner page lists checkout mornings

- When checkout mornings can be read, the cleaner page lists them. It does not name a stay. Nothing was booked or sent.

## 2026-10-31 — the house page month marks booked nights

- The house page month marks booked nights and calendar blocks. It has no price. Nothing is charged yet.

## 2026-10-30 — the house quote button names a booked night

- When the calendar shows those nights are booked or closed, the house page button says so. It does not offer a longer stay. Nothing is sent.

## 2026-10-30 — the quote calendar does not receive guest names

- The quote reads booked nights and a pace word. Guest names, payouts, and notes stay off that response. Nothing is written.

## 2026-10-30 — the stay messages name the chosen arrival and departure

- A chosen arrival time is named on the day-before and check-in messages. A chosen departure time is named on the checkout message. A 2:00 PM leave stays off that message when it is not open. Nothing is sent.

## 2026-10-30 — the return message does not name an open week

- The return message names the published house. It does not say a week is open. It is not a discount. Nothing is sent.

## 2026-10-30 — the quote uses the house schema

- The River House schema includes the published bedroom sentence. Ranch and Lindon do not invent a bedroom count. The quote page uses that same schema and does not add a price.

## 2026-10-30 — the guide search counts children

- A children question in the quote search and the house-page search says children count toward the overnight guests, and a stay needs an adult. Nothing is sent.

## 2026-10-30 — the desk counts children in the party

- A children question says children count toward the overnight guests, and a stay needs an adult. A party of only children does not fit. Nothing is sent.

## 2026-10-30 — the house page can change the party

- The house page can change the guest count and the children. That change updates the quote link and does not hold the dates. Nothing is sent.

## 2026-10-30 — the quote can search the house guide

- The quote can search the published guide, including nearby places. A door-code or Wi-Fi question stays off the page. Nothing is sent.

## 2026-10-30 — the brief names which house still uses a rendering

- The nightly brief and the market page name that the River House still uses a rendering, and that Ranch and Lindon each have one photo. Direct booking still emails a request. Nothing is posted.

## 2026-10-30 — the house quote button uses the shortest stay

- When dates fail a published night rule, the house page quote button uses the shortest stay that check-in can quote. A party that needs both houses still opens the River quote. The link does not hold the dates. Nothing is sent.

## 2026-10-30 — the halfway message names a covered event

- When a stay covers a named event, the halfway message names it and says nothing extra is added. A stay that covers none leaves that line off. Nothing is sent.

## 2026-10-30 — the desk lists upcoming events

- Asked for upcoming events, the desk lists each named event and the shortest stay each house can quote. A named event still answers that event only. A party question still answers the party rule. Nothing is sent.

## 2026-10-30 — the market page lists named events

- The market page lists each upcoming named event and the shortest stay River, Ranch, and Lindon can quote. The links stay on the house pages. They do not hold the dates. Nothing is posted.

## 2026-10-30 — the calendar file names the checkout steps

- The quote calendar file names the checkout steps, including the house step, along with the before-arrival steps. The file says the stay is not booked. Nothing is sent.

## 2026-10-30 — the printed guide names the shortest stay

- When dates fail a published night rule, the printed guide names the shortest stay that check-in can quote. Nothing is charged yet. A passing stay leaves that line off.

## 2026-10-30 — Todd’s card names the same-day clean

- Ranch and River name the standing same-day clean: 5 hours from 11:00 AM to 4:00 PM, or 2 hours when a 1:00 PM arrival or a 2:00 PM leave is named. The line does not say that anyone asked. Lindon stays off. Nothing was booked or sent.

## 2026-10-30 — the Spanish cleaner card translates the drive notes

- The drive notes and the house notes on the cleaner card use the same published facts in Spanish. They stay off the checklist. Nothing is sent.

## 2026-10-30 — a failed stay names the shortest dates

- When dates fail a published night rule, the house list and the house page name the shortest stay that check-in can quote. The link stays on the house page. It does not hold the dates. Nothing is charged yet.

## 2026-10-30 — a rate-card ask names a one-night rule

- A typed ask judged on every house also names a published rule when that night cannot start a one-night stay. The line still has no price. Nothing is posted.

## 2026-10-30 — the calendar file names the before-arrival steps

- The quote calendar file names the before-arrival steps beyond how to arrive and where to park. The file says the stay is not booked. Nothing is sent.

## 2026-10-30 — the desk names the before-arrival steps

- A question about what to do before arrival names those published steps. Those steps have no price. Nothing is sent. A question about the check-in time still names the time.

## 2026-10-30 — the check-in message names the arrival steps

- The check-in message names the same before-arrival steps as the day-before message, beyond how to arrive and where to park. Those steps have no price. Nothing is sent.

## 2026-10-30 — the day-before message names the arrival steps

- The day-before message names the before-arrival steps beyond how to arrive and where to park. Those steps have no price. Nothing is sent. The preview does not include a door code.

## 2026-10-30 — the house list names how a large party splits

- A party larger than one house is told how many stay at the River House and how many stay at the Ranch House. That line has no price and does not hold the dates. The same line is on a house page.

## 2026-10-30 — the desk names how a large party splits

- A party larger than one house is told how many stay at the River House and how many stay at the Ranch House. That line has no price. Nothing is sent.

## 2026-10-30 — a two-house total stays off until the calendar can be read

- A party that needs Ranch and River together still names how the guests split. The together total stays off the page and off the paper until the calendar can be read. Nothing is sent.

## 2026-10-30 — the printed quote names the other houses that fail

- While the calendar cannot be read, the printed guide names this house and the other houses that fail a published night rule for those dates. A house that meets the rule is left off. This does not say a house is open. Nothing is sent.

## 2026-10-30 — the desk names an outdoors day and a Sunday note

- The desk names an outdoors day or a Sunday note from the published guide, the same way it names a ski day. That day has no price. Nothing is sent.

## 2026-10-30 — a house page names the night rule for its dates

- When dates are on a house page, that page names a published night rule this house fails, and the other houses that fail the same dates. A house that meets the rule is left off. This does not say a house is open. Nothing is sent.

## 2026-10-30 — a quote names the other houses that fail the same dates

- While the calendar cannot be read, a quote names the other houses that fail a published night rule for those dates. The house on the quote stays on its own line. A house that meets the rule is left off. This does not say a house is open. Nothing is sent.

## 2026-10-30 — a house page lists the rhythm for its dates

- When dates are on a house page, that page lists arrival, quiet hours, and checkout, plus a named event when the stay covers one. The door-code timing stays on the quote. This does not say the house is open. Nothing is sent.

## 2026-10-30 — the quote names the door-code timing once

- When the stay rhythm is on the quote, the door-code timing stays in that list and is not repeated above it. The code itself stays off the page.

## 2026-10-30 — the printed guide names the door-code timing once

- The printed house guide keeps the sentence about when the door code opens, and it keeps it once. The code itself stays off the paper.

## 2026-10-30 — one nightly ask is judged on every house

- A typed ask on the market rate card is judged for River, Ranch, and Lindon. The lines have no price and do not say the night is booked or open. Nothing is posted.

## 2026-10-30 — the cleaner card says whether quiet hours are in effect

- Each cleaner card says whether quiet hours are in effect in Utah right now, in English or Spanish. The River House guide does not name a clock. The line is not a checklist item. Nothing was sent.

## 2026-10-30 — the quote and the phone say whether quiet hours are in effect

- The quote and the guest phone say whether Ranch and Lindon quiet hours are in effect in Utah right now. The River House guide does not name a clock. The quote does not say the house is open. Nothing is sent.

## 2026-10-30 — the nightly brief names the rate-card week

- The nightly brief and the agents desk name the next seven nights on the rate card for River, Ranch, and Lindon. The list has no price. A nightly-rate question still does not quote a price. Nothing is raised or sent.

## 2026-10-30 — Todd’s card lists the Ranch and River rate-card week

- Todd’s page lists the next seven Ranch and River nights from the rate card. Lindon is not on that list. The list has no price and does not say which nights are booked or open. Nothing is raised or posted.

## 2026-10-30 — the market page compares the rate card across the houses

- The market page lists the next seven nights for River, Ranch, and Lindon together. The list has no price and does not say which nights are booked or open. Nothing is raised or posted.

## 2026-10-30 — a day plan is on the quote and the phone

- The quote and the guest phone can show a ski day, an outdoors day, or a Sunday note from the published guide. The day has no price. On the quote it does not say the house is open. Nothing is sent.

## 2026-10-30 — the quote and the phone list the arrival steps

- The quote and the guest phone list the same before-arrival steps as the house page. A check stays in that tab. The quote does not say the house is open. Nothing is sent.

## 2026-10-30 — an unread construction file is not called empty

- While saved construction documents or partner bills cannot be read, the build page does not call the project file empty and does not log a bill. Nothing was written over them.

## 2026-10-30 — an unread document folder is not called empty

- While saved documents cannot be read, the documents page does not call the folder empty, does not say mail is disconnected, and does not store a file. Nothing was written over them.

## 2026-10-30 — an unread timeline does not call a stay confirmed

- While saved bookings cannot be read, the first message on the guests page says the stay is not booked. Later messages are labeled as what would be sent if it were booked. Nothing is sent.

## 2026-10-30 — an unread guest list does not call mail disconnected

- While saved bookings cannot be read, the guests page does not say mail or text is disconnected, and it does not offer to connect Gmail. Nothing is sent.

## 2026-10-30 — an unread guest list keeps the guide editor closed

- While saved bookings cannot be read, the guest-app editor stays closed and does not load the guide. Nothing is written over it.

## 2026-10-30 — an unread guest list does not show a guest link

- While saved bookings cannot be read, the guests page does not show a guest link. Nothing is sent.

## 2026-10-30 — an unread guest list does not call a night open

- While saved bookings cannot be read, the add-on note does not say a night is open and does not say a stay below can request one. Nothing is ordered or sent.

## 2026-10-30 — an unread guest list does not name a stay on the timeline

- While saved bookings cannot be read, the message timeline says it does not name a stay. Nothing is sent.

## 2026-10-30 — the rules checkbox does not mention a missing request

- While a request cannot be sent, reading the house rules does not say a request exists. When a request can be sent, the checkbox still says that request does not sign the agreement.

## 2026-10-30 — the quote calendar file says the stay is not booked

- The file a guest can save names the house as not booked and marks the event tentative. It does not hold the dates.

## 2026-10-30 — later quote messages wait until the stay is booked

- On the quote, every message after the first is labeled as what would be sent if the stay is booked. The host’s message list is unchanged.

## 2026-10-30 — an unread cleaner desk does not claim the canyon is clear

- While turnovers cannot be read, the canyon line says it does not know whether Provo Canyon and Lindon share a day. A read list that has no mixed day still says so.

## 2026-10-30 — a held quote does not mention a missing button

- While a request cannot be sent, arrival, departure, and the house rules say nothing is sent. They do not tell the guest to use a button.

## 2026-10-30 — the quote’s first message does not call the stay confirmed

- On the quote, that message says the stay is not booked and nothing is sent. The host’s message list still shows the confirmation a booked stay would receive.

## 2026-10-30 — Todd’s paused statement says a direct request stays off

- While the statement cannot be read, that card says a direct request stays off and the quote does not ask for a name. Nothing is sent.

## 2026-10-30 — the home desk says a direct request stays off

- While saved bookings cannot be read, the home page and the nightly brief say a direct request stays off and the quote does not ask for a name. Nothing is sent.

## 2026-10-30 — the request form stays off until it can be sent

- While the calendar cannot be read, the quote does not ask for a name or an email. It says the request stays off. Nothing is sent.

## 2026-10-30 — the request button says why it is off

- When the calendar cannot be read, the request button says the request stays off. Nothing is sent.

## 2026-10-30 — a hidden comp changes the brief’s comp count

- The nightly brief and the host desk count sample comps after a hide on the market page. The published ask stays. Nothing is posted.

## 2026-10-30 — a hidden comp changes the nightly gap

- The brief and the host desk leave out a comp hidden on the market page. The gap count changes. Nothing is posted.

## 2026-10-30 — the nightly brief names the top sample gap

- Each house names the sample amenity our guide does not list. The comps are not live listings. Nothing is posted, and the rate band stays put.

## 2026-10-30 — the host desk names sample amenity gaps

- A host question about amenities names what the sample comps list and our guide does not. The public desk does not. Nothing is posted, and the rate band stays put.

## 2026-10-30 — the house search matches a numbered party

- Searching a house guide for a party size says whether that party fits that house. A party larger than one house is told that Ranch and River together sleep 45. Nothing is sent.

## 2026-10-30 — the quote paper names both houses before the calendar can be read

- A party that needs Ranch and River together still has that split on the paper when the calendar cannot be read. The paper has no price and does not hold either house.

## 2026-10-30 — the desk matches a numbered party

- A question that names a party size says whether that party fits the houses in the question. A party larger than one house is told that Ranch and River together sleep 45. The desk does not send a message and does not quote a price.

## 2026-10-30 — a house page sends a too-large party to the quote that can take it

- A party that needs Ranch and River together gets the River quote. A party that fits only one other house is sent there. A party that fits more than one other house stays on this page. Nothing is held.

## 2026-10-30 — a house page says whether the party fits

- When a house link includes a party size, the page says whether that party fits the house. A party larger than one house is told that Ranch and River together sleep 45. The page does not say the house is open, and it does not hold the dates.

## 2026-10-30 — Todd’s events open the house page

- A Ranch or River event on Todd’s page links to that house with the shortest stay the rate card can quote. Lindon stays off the list. The link does not hold the dates and does not invent a party.

## 2026-10-30 — an event link uses the party from the search

- An upcoming-event link on the house list opens that house with the event’s shortest stay and the party already entered. It does not invent a party. The link does not hold the dates.

## 2026-10-30 — the house list keeps a stay on each card

- A house-list card keeps the chosen dates and party size. Opening it restores that stay on the house page, and the quote link keeps the party. The card does not hold the dates.

## 2026-10-30 — a house page link keeps the chosen stay

- Opening a house page with check-in and checkout dates restores that stay. The page link keeps those dates and does not hold them. Nothing is charged.

## 2026-10-30 — a house page can pick a stay for the quote

- A public house page shows the rate-card month. Choosing a check-in and a checkout morning fills the quote link. The month does not say which nights are booked or open. Nothing is charged or held.

## 2026-10-30 — the quote counts the nights until check-in

- The quote and the guest phone say how many nights are left until check-in, or until checkout once the stay has started. The quote does not say the house is open. Nothing is sent.

## 2026-10-30 — a house page and a quote name the house in the tab

- The browser tab on a public house page and on the quote uses that house’s name. The share line has no price and does not say the house is open. Nothing is posted to Airbnb or VRBO.

## 2026-10-30 — the house page schema names safety and the short stay

- The public house schema names no lifeguard, no fireworks, and that the stay is not a residential lease. A hot tub stays only on the Ranch House. Nothing is posted to Airbnb or VRBO.

## 2026-10-30 — the confirmation says this is not a lease

- The booked-stay preview says this is a short stay, not a residential lease, and that the stay ends at checkout. The message does not sign the agreement. Nothing is sent, and the door code stays off.

## 2026-10-30 — the stay is not a residential lease

- The house page and the stay agreement say this is a short stay, not a residential lease, and that the stay ends at checkout. Reading that does not sign the agreement. Nothing is sent.

## 2026-10-30 — the house page names the safety line

- The public house page says no lifeguard is on duty, children need an adult around water, stairs, decks, and the street, and there are no fireworks. The page does not sign the agreement. Nothing is sent.

## 2026-10-30 — the cleaner card names the safety line

- When the turnover list cannot be read, each house card says no lifeguard is on duty, children need an adult around water, stairs, decks, and the street, and there are no fireworks. The card does not sign the agreement. Nothing was sent.

## 2026-10-30 — the stay agreement names safety

- The stay agreement says no lifeguard is on duty, children need an adult around water, stairs, decks, and the street, and there are no fireworks. A fireworks question uses that topic. Reading it does not sign the agreement, and nothing is sent.

## 2026-10-30 — the confirmation names the stay agreement

- The booked-stay preview says the house is provided as-is and that belongings are not insured. The message does not sign the agreement. Nothing is sent, and the door code stays off.

## 2026-10-30 — Todd’s card names the stay agreement

- Todd’s page names what guests read before a direct request: the house as-is, and that belongings are not insured. Ranch covers the hot tub. River covers the river. Lindon stays off. The page does not sign the agreement, and nothing is sent.

## 2026-10-30 — the desk answers insurance and a cancelled stay from the agreement

- A question about insurance or a broken amenity uses the stay agreement. The desk and the house search do not invent a refund. Nothing is sent.

## 2026-10-30 — the stay agreement says belongings stay with the guest

- The quote, the paper, and the guest phone say the host does not insure belongings, vehicles, or cash. Travel insurance and medical coverage stay with the guest. Reading that topic does not sign the agreement, and nothing is sent.

## 2026-10-30 — the stay agreement names the house as-is

- The quote, the paper, and the guest phone list that the house is provided as-is. A broken amenity does not cancel the stay unless the host agrees in writing. The host may end the stay without a refund for a serious rules violation. Reading that topic does not sign the agreement, and nothing is sent.

## 2026-10-30 — a house page names the event that house can quote

- The public house page names the next event that house can quote. The River House skips an event that ends before November 1. Nothing extra is added, and nothing is charged yet.

## 2026-10-30 — the brief does not open a leave while blocks are unread

- When calendar blocks cannot be read, a checkout on the nightly brief does not say a 2:00 PM leave is a request, and it does not say an early arrival is open. Nothing was written over the blocks.

## 2026-10-30 — the guest phone does not call a night free

- When saved bookings cannot be read, the guest phone still can show the guide, and it does not say the night before or the checkout morning is free. A failed guide read does not fall back to a stand-in guide. Nothing was written over the guide or the bookings.

## 2026-10-30 — the house search does not invent a pet rule

- A dog question in the house-page search says the published guide does not name a pet rule. It does not invent one. A question the guide does not cover still says so. Nothing is sent.

## 2026-10-30 — a missing block list is not no blocks

- When calendar blocks cannot be read, the quote does not build a calendar from bookings alone. The owner page and the nightly brief do not call those nights open. Nothing was written over the blocks.

## 2026-10-30 — the house page schema names the party rule

- The public house schema names the party line already in the guest guide. The River House keeps the written-approval line. Ranch and Lindon say no parties. The hot tub stays on the Ranch House only. Nothing is posted to Airbnb or VRBO.

## 2026-10-30 — a paused read is not an empty calendar

- The public night list and the booking list say when the saved bookings could not be read. The quote does not treat that as an empty calendar, so it does not show a price or turn the request on. Nothing was written over the bookings.

## 2026-10-30 — a pet question does not invent a rule

- The quote says the published guide does not name a pet rule, and it does not invent one. The house desk answers a dog the same way. A party at the River House stays off the request. A Thanksgiving question still names the shortest stay.

## 2026-10-30 — a house tab names the event it can quote

- The home page still names the next portfolio event, and it says the River House is not on an event that ends before November 1. A house tab names the next event that house can quote. The River House names BYU at Utah, not the Arizona State weekend.

## 2026-10-30 — the cleaner card names the next event

- When the turnover list cannot be read, each cleaner card names the next event the rate card can quote. The River House skips an event that ends before it opens. The card does not name a stay. Nothing was booked or sent.

## 2026-10-30 — the desk names a holiday stay

- A question that names an event gets the shortest stay the rate card can quote. Thanksgiving at the River House is 4 nights. An event that ends before the River House opens is not on that house. Nothing is charged yet.

## 2026-10-30 — Todd’s page names Ranch and River events

- Todd’s page lists upcoming events and the shortest Ranch and River stay from the rate card. The River House stays off an event that ends before it opens. Lindon is not on that list. Nothing is charged yet.

## 2026-10-30 — the printed guide leaves the price off

- While the calendar cannot be read, the print note says the price stays off the guide. A grocery list can still be on that guide. Nothing is ordered, and the print button is not used to send anything.

## 2026-10-30 — a grocery list stays on the quote

- A marked River grocery drop can include a list. The list stays in that tab. A price or a door code stays off the paper. Nothing is ordered or charged, and the stay is not booked.

## 2026-10-30 — a grocery drop or a hot tub can be marked

- While the calendar cannot be read, the River House can mark a grocery drop and the Ranch House can mark the hot tub. The trip paper says that would be on the request. The stay is not booked. Early arrival and a later checkout still wait. Nothing is charged yet.

## 2026-10-30 — the trip paper lists nearby places

- The trip paper lists the published nearby places in the same groups as the guide. The list has no price. The paper is not a booking.

## 2026-10-30 — the trip paper names the chosen times

- A chosen arrival, or an 11:00 AM departure, is written on the trip paper. A 2:00 PM leave stays off until that morning is open. The line says the stay is not booked, and nothing is sent.

## 2026-10-30 — the desk names rate-card lengths

- A question with one check-in names the lengths the rate card can quote. A date before the River House opens quotes none. Two dates still use the stay rule. Nothing is charged yet, and the desk does not send a message.

## 2026-10-30 — unread market keeps the ask off the page

- While the calendar cannot be read, the market page does not show the next-30 ask, the comp median, the rate band, or a sample’s weekend ask. The nightly trial starts blank. Nothing is posted.

## 2026-10-30 — the river photo line uses the guide

- The River House cleaner card repeats the published bedroom sentence on the photo step. Ranch and Lindon have no bedroom sentence, so they do not invent one. A photo stays in the tab and is not uploaded.

## 2026-10-30 — the rate card offers longer lengths

- When the calendar cannot be read, a check-in the rate card can quote offers longer lengths. Choosing one does not say the house is open. Nothing is charged yet. A check-in before the River House opens offers none.

## 2026-10-30 — seven rate-card nights stay unraised

- When the calendar cannot be read, the market page lists the next seven nights from the rate card. A night before the River House opens says not yet. The other nights name the shortest start. None are raised. Nothing is posted.

## 2026-10-30 — a passing stay shows the trip paper

- Dates that pass the rate card show the published guide as a trip paper: arrival, parking, notes, and checkout. The paper says it is not a booking. The door code stays off it. A stay that fails the rate card hides the paper. Nothing is sent.

## 2026-10-30 — the host desk counts fair comps

- The host desk says how many sample comps sleep close to a house and sit within 10 miles. The public house list does not. The answer does not change the rate band. Nothing is posted.

## 2026-10-30 — fair comps can be viewed alone

- The market list can show only the samples that sleep close and sit within 10 miles. The view stays in that tab. It does not change a pin, a hide, or the rate band. Nothing is posted.

## 2026-10-30 — Ranch and River are added before the fee

- Todd’s page tries a Ranch amount and a River amount together. They are added before the fee. An equal gain and loss has no fee. The trial is not the statement, and it does not read saved bookings.

## 2026-10-30 — the canyon trip sits beside the clock

- A day with the River House and a Lindon house says the canyon is a separate trip. The clock line still says whether the turns fit, and it does not add the drive. A desk with no mixed day says so. Nothing was booked or sent.

## 2026-10-30 — a quote can show the messages

- Dates that pass the rate card show the messages a booked stay would receive. The list says this stay is not booked. The confirmation line says the calendar file does not hold the dates. Nothing is sent. A stay that fails the rate card hides the list.

## 2026-10-30 — the house list compares an event

- When the calendar cannot be read, the house list shows each upcoming event at River, Ranch, and Lindon. The length is the shortest stay the rate card can quote. A River event that ends before the first stay stays off that house. The link does not hold the dates. Nothing is charged yet.

## 2026-10-30 — upcoming events name a rate-card stay

- When the calendar cannot be read, the quote names each upcoming event and the shortest stay the rate card can quote from it. The River House skips an event that ends before the first stay. The list does not say the house is open. Nothing is charged yet.

## 2026-10-30 — the home desk names quiet hours

- When saved bookings cannot be read, the home page says whether Ranch and Lindon quiet hours are in effect in Utah. The River House guide does not name a clock. Nothing is sent.

## 2026-10-30 — quiet hours follow the published window

- Ranch and Lindon say whether 10:00 PM to 8:00 AM is in effect in Utah. The River House guide does not name a clock, so the page does not invent one. Nothing is sent.

## 2026-10-30 — a rate-card month while the calendar is unread

- The quote shows a month from the rate card when the calendar cannot be read. Each night shows the shortest stay that can start there. The month does not say which nights are booked or open, and it has no price.

## 2026-10-30 — sample comps can be sorted

- The market page can sort the sample comps by distance, rating, sleeps, or reviews. A pin stays first. The sort stays in that tab, and nothing is posted.

## 2026-10-30 — a trial split is not the statement

- A whole-dollar amount can be tried on Todd’s page. The fee comes first, then the remainder splits in half. A loss after the fee splits the same way. The trial does not read saved bookings, and nothing is written over them.

## 2026-10-30 — a calendar file does not hold the dates

- Dates that pass the rate card can be saved as a calendar file. It names the house, the address, and check-in and checkout. It does not hold the dates, and it does not quote a price.

## 2026-10-30 — the shortest stay the rate card can quote

- When a stay fails the rate card, the quote names the shortest length that check-in can quote. It does not say the house is open, and nothing is charged yet.

## 2026-10-30 — a month and a day is a stay

- The house desk accepts a stay written as November 13 to 15. It uses the published stay rules. A passing stay is not called open, and no price is quoted.

## 2026-10-30 — the drive notes stay on the cleaner card

- When the turnover list cannot be read, each house card still shows the published drive notes. They are not part of the clean checklist. Nothing is sent.

## 2026-10-30 — before you arrive

- Each house page lists the published arrival notes as checks. A check stays in that tab. Nothing is sent, and no price is quoted.

## 2026-10-30 — Todd’s statement stays off while the books cannot be read

- The owner page keeps the split card and leaves the statement off. It does not show a stand-in total. Nothing was written over the bookings.

## 2026-10-30 — both houses have to be free

- A two-house request names the River House and the Ranch House. If either house already has those nights, the request is refused before it is saved or emailed.

## 2026-10-30 — the canyon house is its own trip

- The cleaner route keeps the Ranch House and the Lindon House on one Lindon trip. The River House is a separate trip up Provo Canyon. Nothing is booked or sent.

## 2026-10-30 — a rate-card ask while the calendar is unread

- The market page can judge a typed nightly ask against the floor, the ceiling, and the 8% cap while the calendar cannot be read. The night is not raised. The line does not say the night is booked or open. Nothing is posted.

## 2026-10-30 — a stay can cross seasons

- A River quote names every season the dates cross. While the calendar cannot be read, that line has no price. Nothing is charged yet.

## 2026-10-30 — a day from the published guide

- A house page can compose a ski day, an outdoors day, or a Sunday note from the published guide. The house guide can plan a ski day the same way. Nothing is sent, and no price is quoted.

## 2026-10-30 — Ranch and River can be one request

- A party that needs both houses can be one request after the River House agreement and the Ranch House agreement are opened. The request stays off until the calendar can be read. Nothing is held, and nothing is charged yet.

## 2026-10-30 — a house note needs no stay

- The cleaner can save a note for a house when no stay is on the list. It stays in this browser. A door code and a price stay off the note. Nothing is sent, and it does not change a booking or an expense. The nightly brief names that note.

## 2026-10-30 — the house page searches the published guide

- A search on a house page looks through that house’s published guide, including nearby places. The house guide uses the same list when a question is not already answered. Door codes and Wi-Fi stay off. Nothing is sent, and no price is quoted.

## 2026-10-30 — a checked add-on stays out of the stay total

- The quote names a checked add-on apart from the stay total. Nothing is charged yet. A party, an event, or an unread agreement still leaves the price off the paper.

## 2026-10-30 — a guest total can still name the children

- A booking note that says a guest total and a child count keeps the children when they fit inside that total. A child count larger than the guest total stays off the turnover line. Names stay off the line.

## 2026-10-30 — the house page names the stay agreement

- A question about the stay agreement names the topics for that house. Reading them does not sign it. Nothing is sent, and no price is quoted.

## 2026-10-30 — a house page answers for that house

- Each public house page answers a question about that house. Naming another house still answers that house. Nothing is sent, and no price is quoted.

## 2026-10-30 — the house guide names the departure steps

- Asking what to do before checkout names that house’s departure list. Asking when checkout is still names the time. Nothing is sent, and no price is quoted.

## 2026-10-30 — a saved checkout list keeps the house step

- The guest phone keeps the saved departure lines and adds toilet paper only at the River House, or the hot tub cover at the Ranch House, when that line is missing. The saved guide is not rewritten.

## 2026-10-30 — checkout names the house rule

- The River House departure list adds toilet paper only. The Ranch House departure list adds the hot tub cover. The Lindon House keeps the shared steps. Nothing is sent.

## 2026-10-30 — the public house schema names published facts

- Each public house page says no smoking indoors in its schema. The Ranch House also names the hot tub. The River House and the Lindon House do not. No price is added.

## 2026-10-30 — the owner letter stays off while bookings cannot be read

- The documents page keeps the vault. The letter stays off until saved bookings can be read, so a stand-in statement is not downloaded. Nothing was written over them.

## 2026-10-30 — an unread calendar does not count a raise

- When the calendar could not be read, the market card does not count shadow raises, and the 30, 60, and 90 night share does not use a stand-in. Nothing is posted.

## 2026-10-30 — a stretch no stay can cover is not called open

- Todd’s next stretch and the nightly brief leave a one-night hole unbooked. The line does not call that stretch open. The published rate stays. Nothing is posted.

## 2026-10-30 — the guest messages wait for the agreement topics

- The week-before message and the day-before message say the door code waits until the house rules are read and each stay-agreement topic is opened. Opening a topic does not sign the agreement. The code stays off the message. Nothing is sent.

## 2026-10-30 — the standing clean waits for a room photo

- When the turnover list cannot be read, the standing clean list can still be checked. The room-photo step stays open until a photo is in this tab. The photo is not uploaded. The card does not name a stay. Nothing is booked.

## 2026-10-30 — the door code waits for the agreement topics

- On the guest phone, the door code and Wi-Fi stay off until the house rules are read and each stay-agreement topic is opened. Opening a topic does not sign the agreement. Nothing is sent.

## 2026-10-30 — the quote waits for the agreement topics

- Each stay-agreement topic has to be opened before a request. Opening a topic does not sign the agreement. The paper leaves the price off until every topic for that house is open. Nothing is sent.

## 2026-10-30 — the agents desk names the split

- On `#/agents`, the desk answers the Ranch and River split and the rate rules. The answer has no price and no ledger amount. A nightly rate stays off the desk. The public house list does not answer the split. Nothing is sent, and a booking or a saved expense is not changed.

## 2026-10-30 — a party or event stays off the request

- The booking page can mark a stay as a party or an event. The request stays off. The River House asks for written approval. The Ranch House and the Lindon House do not take a party. The paper leaves the price off that stay. The quote link keeps that mark. Nothing is sent.

## 2026-11-10 — platform spine, fixtures where a key is missing

- Read-only backup of production KV: 539 keys, written outside the repo at the home folder `uml-data-backups/2026-11-10`. Nothing in Cloudflare was written or deleted. Counts only: 464 expense rows totaling $1,317,228.54, 75 stored reservation rows (61 not cancelled, payout $90,720.57), 377 receipt keys, 77 construction keys, 51 construction documents whose amount fields sum to $2,751,478.39. The full dump is about 229 MB because receipt bytes are in it. It was not uploaded to Google Drive from this session.
- The new routes refuse a bad webhook, refuse a bulk delete, and do not send a rate or a guest message. Health reports which keys exist and does not return the secret. The rate engine stays in shadow. Stripe live keys are refused. Tax lines are an unconfirmed estimate and are not added to the quoted stay.
- `npm test` is 1828 passing. `tsc -b`, the functions check, the route-guard check, and the production build passed. The competitive radar diff names inbox auto-send, Seam unlock, and live AirROI as still waiting.
- In the browser on the local app: the stay preview shows the check-in steps and says they do not open a lock. Privacy, terms, and accessibility pages render. The house list renders and says a quote does not charge a card. The booking page would not quote because the calendar could not be read, so the tax lines stayed off. The signed-in desk was not opened here. The local server asks production for sign-in.
- Still waiting on an AirROI key, a Stripe test secret, a Seam account, Ben Campbell's tax rates, a vision key, and the domain cutover. The worker cron is in source and is not deployed. Map tiles stay a sketch. The existing 30-minute request hold was left as it is.

## 2026-11-10 — D1 is live, and the desk reads it

- **The market database exists.** `uml-market` and `uml-market-preview` were created and `0001_market.sql` applied to both, then `0002_growth.sql` for the funnel and A/B tables. `MARKET_DB` is bound in `wrangler.toml` with the preview database. Expenses, bookings, receipts, construction, e-sign, guides, and calendar state stay in KV — the tables here are new ones only. R2 is still off: the account answers "please enable R2 through the Cloudflare Dashboard", so `PHOTOS` stays commented and the desk keeps saying a cleaner photo is not stored.
- **The feature catalog is in D1.** 53 rows upserted into `feature_registry`; the seed deletes nothing, so a note a person writes survives a reseed. `POST /api/platform/registry` reseeds, and a re-run proved idempotent (53 rows before and after). `scripts/seed-feature-registry.ts` runs it from a shell with `--dry` to preview.
- **The funnel is real, not a shape.** `POST /api/funnel` stores a step, a house, and an optional random visit id — no address, name, phone, or device — and refuses a step outside the four or a day at its ceiling. `GET /api/platform/funnel` is host-only counts. The booking page sends `view`, `quote`, and `checkout` in a production build only, because the dev server proxies `/api` to production and a local page load must not write rows into the live table. Verified in a real Pages runtime: a step stored, a bad step answered 400, counts answered signed-in and 401 unsigned.
- **Nights at risk** is on the desk. It counts open nights inside 14 days that **no stay can book**, judged by the booking engine's own `bookableNights` rather than a second copy of the minimum-stay rule, so it cannot disagree with the booking page. A cancelled stay does not cover its nights; a night the host closed is not a risk.
- **The morning list is visible.** `GET /api/platform/status` existed and nothing read it. It now sits under the terrain sketch on Overview and names the six things still missing. A failed read says the list could not be read and that this does not mean nothing is waiting.
- **Turnstile is wired end to end and cannot pretend.** The account cannot create a widget yet — the Wrangler token has no `Account.Turnstile:Edit` scope — so the server check is written and behaves correctly in all three states, verified in a runtime: with no secret the booking form works and the response records that no bot check ran; with a secret, a missing token answers **403 "A Turnstile token is required."** and a bad one **403 "The bot check did not pass."**; a good token must match the action `book_request` and, when `TURNSTILE_HOSTNAMES` is set, the hostname.
- **A real bug in the widget, found by testing it.** The host node was a `ref`, and the form is conditionally rendered, so the effect ran once while the form was hidden, found no node, and never ran again: the check never drew and the button stayed disabled with nothing explaining why. It is a callback ref now. On the enforced runtime the widget draws the moment the form appears and the button enables.
- Full suite 1832 passing, `tsc -b`, the functions check, the route-guard check (81 host routes), and the build all pass. The desk was opened signed-in on a local Pages runtime with the D1 binding: the terrain sketch, the morning list, the Market tab (comps, band, pace, 12-month heat, what-if, opportunities), and the agent switches (every risky one off) all render.

## 2026-11-10 — the kill switch was a button, not a switch

- **The plan's per-house kill switch did not exist.** The Market board's Pause button flipped a `useState`, and `/api/pricing/push-plan` hard-coded `paused: false` for all three houses before calling `runShadow`. So the switch a host pressed was not the switch the authoritative plan read: pausing the River House left the plan proposing its raises. Found by following the flag from the button to the gate rather than trusting the button's own copy.
- It is now one stored fact in D1 `house_pause`, read by the plan and written by the board. `GET/POST /api/pricing/pause` is host only. `runShadow` receives `pause.paused[house]`, so a paused house's nights are held, and each house's plan carries its own reason.
- **A switch that cannot be read is not a switch that is off.** With no binding, or a failed read, `readPause` reports `readable: false` and **every house paused**. The plan's response carries `pause: { paused, readable, why }` so a quiet plan cannot be mistaken for a live one.
- Verified end to end on a local Pages runtime with the D1 binding: clicked Pause on the Market board, a fresh `GET /api/pricing/pause` read `{"river":true}` from the database, and `/api/pricing/push-plan` answered `gate.paused: true` with River's plan `allowed: false`, `payload: null`, hold `"This house is paused for the season. The published rate stays."` — while Ranch and Lindon named the shadow-week gate instead. Resuming restored all three. A bad house name answers 400.
- `0003_pause.sql` applied to `uml-market` and `uml-market-preview`; both now carry `house_pause` beside the market tables. New tests cover the invariant (the plan reads the switch, the board saves it, the button no longer only flips state), a paused house held with the other gates open, and an unreadable switch pausing every house. 1835 passing.

## 2026-11-10 — the change log had a table and no writer

- **`rate_changes` has existed since the first migration and had never been written.** `changeLogEntry` in `rate-engine.ts` was a defined function with no caller. The plan requires "every change is logged with a reason", so this was another label with nothing behind it — the same shape as the dead pause button found an hour earlier.
- The plan now logs what it proposes. One row per night whose rate actually moved, with `before_rate`, `after_rate`, the reason, `mode: 'shadow'`, and nothing ever marked sent. A hold, a booked night, or a zero change is filtered out by `shouldLog` before the database is touched, so a caller cannot fill the table with non-events.
- `GET /api/pricing/changes` is host only and reads newest first. `stored: false` is distinct from an empty log, and the panel says so — a host who reads "no changes" when the read failed would believe nothing moved.
- **A defect in my own first version, caught by running it twice.** I documented the write as idempotent per house and night, then implemented a plain INSERT: two plan runs wrote the same night twice and the log read as though the rate had moved twice. It now clears that night's shadow row before inserting, which is what the comment claimed. Verified by three consecutive plan runs against a real D1 table producing **one** row, and a test that pins the delete-then-insert order. A live row is a different `mode` and is never removed.
- Verified end to end on a local Pages runtime: with a saved comp carrying three dated asks, the plan proposed one night on the Ranch, `changeLog.written` came back 1, the row read `Ranch, 2026-11-12: lowered $640 → $512. A 20% fill promotion on a night the fill rules call short. Nothing was sent.`, and the Change log panel rendered it on `#/market`. The verification comp and approved night were then removed.
- Along the way the guards proved themselves twice: the plan refuses to move a night off the invented sample set (`liveComps: 0` → `hold`), and the approved-rate route refused $100 with the real floor named ($125) rather than accepting it. 1838 passing.

## 2026-11-10 — a cleaner's tick no longer vanishes with the signal

- **The offline requirement had a page that could not open offline.** `CleanLink` awaited the server on every tick, and when the fetch failed the tick was **silently dropped** — a cleaner at a canyon house could tick down a whole checklist and lose every mark with nothing telling them. The service worker cached only `/assets/`, so a navigation to `/clean/<token>` had nothing to serve at all.
- **Ticks are now written to the phone before the request.** `clean-offline.ts` keeps a per-token cache of the last job list and a queue of turns whose ticks the server has not confirmed. A queued tick shows as ticked immediately and the page says `1 turn not sent yet`; a confirmed turn leaves the queue. The wording never uses "saved" for an unsent tick — that was the whole failure.
- **The service worker was rewritten, and the first version of it was wrong in a way that would have shipped a dead offline mode.** I wrote `Promise<string[]>` and `new Set<string>()` in `public/sw.js`. Vite copies that file verbatim and does not typecheck it, so the browser refused to evaluate the worker: `register('/sw.js')` failed with "ServiceWorker script evaluation failed" and the app fell back to network-only. Caught by testing it in a browser, then pinned by a test that runs the file through the parser instead of grepping it.
- **The second bug in the same file:** the cache held only `/` and the manifest, not the bundle. Assets are requested on the first visit *before* the worker controls the page, so a "cache on miss" branch never sees them — the shell loaded and the app could not mount, a blank page. The worker now reads the hashed filenames out of the shell at install and precaches them.
- **Verified in a browser with the network actually emulated off.** Loaded the cleaner link, confirmed the cache held `/assets/index-*.js` and the CSS, set Chrome to offline, reloaded: the page still rendered its turnover and read "Offline. Your ticks are kept on this phone." Ticked a step: it showed done, `uml.clean.queue` held it, and the line read "Offline. 1 turn kept on this phone and will send when the signal returns." Restored the network: the queue drained to `[]` and a server read confirmed `river 2026-11-22: beds`. Then the verification tick was cleared.
- The API is never cached, in either direction — a cached expense list or door window shown as current would break the one standard this app holds. 1841 passing.
