// Deterministic fallback for the AI trip parser: used when no AI key is configured or the AI call fails.
export type TripIntent = {
  place: string | null;
  time: string | null; // HH:MM 24h
  hours: number | null;
  budget: number | null;
  walk: number | null;
  pref: "free" | "paid" | "both" | null;
};

export function parseTripRules(text: string): TripIntent {
  const t = ` ${text.toLowerCase()} `;
  const out: TripIntent = { place: null, time: null, hours: null, budget: null, walk: null, pref: null };

  const tm = /\b(?:at|by|around)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/.exec(t) ?? /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/.exec(t);
  if (tm) {
    let h = Number(tm[1]);
    const ap = tm[3];
    if (ap === "pm" && h < 12) h += 12;
    if (ap === "am" && h === 12) h = 0;
    if (!ap && h >= 1 && h <= 10) h += 12; // "dinner at 8" means 8 pm
    if (h <= 23) out.time = `${String(h).padStart(2, "0")}:${tm[2] ?? "00"}`;
  }
  if (!out.time) out.time = /\bdinner\b/.test(t) ? "20:00" : /\blunch\b/.test(t) ? "13:00" : /\bbreakfast|brunch\b/.test(t) ? "09:30" : null;
  const hr = /(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b/.exec(t);
  if (hr) out.hours = Math.round(Number(hr[1]));
  const bud = /(?:₹|rs\.?|inr|budget(?: of)?|under|below|max(?:imum)?)\s*₹?\s*(\d{2,4})/.exec(t) ?? /(\d{2,4})\s*(?:rupees|rs|inr)\b/.exec(t);
  if (bud) out.budget = Number(bud[1]);
  const wk = /(\d{2,4})\s*(?:m|metres|meters|mtrs)\b/.exec(t);
  if (wk) out.walk = Number(wk[1]);
  else if (/short walk|don'?t want to walk|close by|nearby parking|very close/.test(t)) out.walk = 300;
  else if (/(\d+)\s*min(?:ute)?s?\s*walk/.test(t)) out.walk = Number(/(\d+)\s*min/.exec(t)![1]) * 75;
  if (/free (?:parking )?only|only free|free parking/.test(t)) out.pref = "free";
  else if (/paid (?:is fine|ok|okay)|don'?t mind paying|paid parking/.test(t)) out.pref = "paid";

  const pl = /\b(?:near|in|at|around|to)\s+([a-z][a-z .'-]{2,40}?)(?=\s+(?:at|for|by|around|with|under|tonight|today|tomorrow|on)\b|[,.;]|\s*$)/.exec(t);
  if (pl && !/^\d/.test(pl[1]!)) out.place = pl[1]!.trim().replace(/\b\w/g, (c) => c.toUpperCase());
  return out;
}
