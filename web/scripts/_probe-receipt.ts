import { guestRequestReceipt } from "../src/lib/booking-mail.ts";
for (const g of [undefined, 1, 6]) {
  try {
    const r = guestRequestReceipt({ guestName: "A", houses: ["ranch"], checkIn: "2027-03-08", checkOut: "2027-03-11", nights: 3, ...(g === undefined ? {} : { guests: g }) });
    console.log("guests=" + g, "ok:", r.subject);
  } catch (e) { console.log("guests=" + g, "THREW:", (e as Error).message); }
}
