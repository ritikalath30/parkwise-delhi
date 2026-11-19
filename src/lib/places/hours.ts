import type { WeeklyHours } from "./types";

// Minimal parser for the common subset of the OSM opening_hours syntax. Anything it does not
// understand (public holidays, months, sunrise, comments…) returns null = "hours unknown".

const DAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

function parseDays(spec: string): number[] | null {
  const out = new Set<number>();
  for (const part of spec.split(",")) {
    const m = /^(Mo|Tu|We|Th|Fr|Sa|Su)(?:-(Mo|Tu|We|Th|Fr|Sa|Su))?$/.exec(part.trim());
    if (!m) return null;
    const a = DAYS.indexOf(m[1]!);
    const b = m[2] ? DAYS.indexOf(m[2]) : a;
    for (let i = a; ; i = (i + 1) % 7) {
      out.add(i);
      if (i === b) break;
    }
  }
  return [...out];
}

function parseTimes(spec: string): [number, number][] | null {
  if (spec.trim() === "off" || spec.trim() === "closed") return [];
  const ranges: [number, number][] = [];
  for (const part of spec.split(",")) {
    const m = /^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})\+?$/.exec(part.trim());
    if (!m) return null;
    const s = Number(m[1]) * 60 + Number(m[2]);
    let e = Number(m[3]) * 60 + Number(m[4]);
    if (s > 1440 || e > 2880) return null;
    if (e <= s) e += 1440; // past midnight
    ranges.push([s, e]);
  }
  return ranges;
}

export function parseOpeningHours(raw: string | null | undefined): WeeklyHours | null {
  if (!raw) return null;
  const v = raw.trim();
  if (v === "24/7") return Array.from({ length: 7 }, () => [[0, 1440]] as [number, number][]);
  const week: WeeklyHours = Array.from({ length: 7 }, () => []);
  for (const rule of v.split(";")) {
    const r = rule.trim();
    if (!r) continue;
    const m = /^(?:([A-Za-z,\- ]+?)\s+)?([\d:,\-+ ]+|off|closed)$/.exec(r);
    if (!m) return null;
    const days = m[1] ? parseDays(m[1].replace(/\s+/g, "")) : [0, 1, 2, 3, 4, 5, 6];
    const times = parseTimes(m[2]!);
    if (!days || !times) return null;
    for (const d of days) week[d] = times; // later rules override earlier ones, as in OSM
  }
  return week;
}

/** Day index (0 = Monday) for an ISO date string. */
export function weekdayIndex(dateISO: string): number {
  const d = new Date(`${dateISO}T12:00:00Z`);
  return (d.getUTCDay() + 6) % 7;
}

/** Is the whole span [startMin, startMin + durationMin) open, allowing ranges that join across midnight? */
export function coversSpan(h: WeeklyHours, day: number, startMin: number, durationMin: number): boolean {
  // Lay the previous, current and next two days on one timeline (minutes from the start of `day`),
  // then sweep: coverage must be continuous from start to end.
  const ranges: [number, number][] = [];
  for (let k = -1; k <= 2; k++) for (const [s, e] of h[(day + k + 7) % 7]!) ranges.push([s + k * 1440, e + k * 1440]);
  ranges.sort((a, b) => a[0] - b[0]);
  const end = startMin + durationMin;
  let t = startMin;
  for (const [s, e] of ranges) {
    if (s > t) break; // gap before this range
    if (e > t) t = e;
    if (t >= end) return true;
  }
  return false;
}

export function isOpenAt(h: WeeklyHours, day: number, min: number): boolean {
  return coversSpan(h, day, min, 1);
}
