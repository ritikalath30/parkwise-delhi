import type { Charge } from "./types";

// Parses the OSM `charge` tag (e.g. "20 INR/hour", "₹30/hr", "INR 50/day", "30 INR"). Only INR is
// accepted because budgets are in ₹; anything else is kept raw and treated as an unknown price.
export function parseCharge(raw: string | null | undefined): Charge | null {
  if (!raw) return null;
  const first = raw.split(";")[0]!.trim();
  const m = /^(?:(?:INR|Rs\.?|₹)\s*)?(\d+(?:\.\d+)?)\s*(?:INR|Rs\.?|₹)?\s*(?:\/\s*(?:1\s*)?(hour|hr|h|day|d|visit|entry))?$/i.exec(first);
  if (!m || !/INR|Rs|₹/i.test(first)) return null;
  const unit = (m[2] ?? "").toLowerCase();
  const per = unit.startsWith("h") ? "hour" : unit.startsWith("d") ? "day" : "visit";
  return { amount: Number(m[1]), currency: "INR", per };
}

/** Estimated charge in ₹ for a stay, or null when the price is unknown. */
export function chargeFor(fee: "yes" | "no" | "unknown", charge: Charge | null, hours: number): number | null {
  if (fee === "no") return 0;
  if (!charge) return null;
  if (charge.per === "hour") return charge.amount * Math.max(1, Math.ceil(hours));
  if (charge.per === "day") return charge.amount * Math.max(1, Math.ceil(hours / 24));
  return charge.amount;
}

export function chargeLabel(fee: "yes" | "no" | "unknown", charge: Charge | null, raw: string | null): string {
  if (fee === "no") return "Free (₹0)";
  if (charge) return `₹${charge.amount}${charge.per === "visit" ? " per visit" : `/${charge.per}`}`;
  if (raw) return `As mapped: "${raw}"`;
  return fee === "yes" ? "Paid · price unavailable" : "Price unavailable";
}
