import { quoteStay } from "../src/lib/quote.ts";
import { partyNote } from "../src/lib/house-stay.ts";
try {
  const q = quoteStay("ranch", "2027-03-08", "2027-03-11", [], { guests: 6 });
  console.log("quote ok:", q.ok, q.ok ? q.stayTotal : q.reason);
} catch (e) { console.log("quote THREW:", (e as Error).message); }
try { console.log("partyNote:", partyNote("6", "")); } catch (e) { console.log("partyNote THREW:", (e as Error).message); }
