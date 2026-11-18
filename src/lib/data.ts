// SAMPLE DATA for the ParkWise GeoAI prototype.
// Restaurant names are fictional; parking names, tariffs and capacities are illustrative.
// Parking availability is SIMULATED from time-of-day demand curves — it is not live data.

export type AreaId = "hkv" | "khan" | "cp";
export type ParkingAccess = "free" | "paid" | "shared";
export type Authorisation = "authorised" | "shared-permission" | "unverified" | "restricted";

export type RestrictedZone = { id: string; name: string; reason: string; center: [number, number]; radius: number };

export type Restaurant = {
  id: string;
  name: string;
  cuisine: string;
  price: 1 | 2 | 3;
  rating: number;
  lat: number;
  lng: number;
  blurb: string;
};

export type Parking = {
  id: string;
  name: string;
  operator: string;
  kind: "Surface" | "Multi-level" | "Underground";
  /** Kept for readability: true only for authorised or owner-permitted shared parking. */
  verified: boolean;
  /** Free (₹0) authorised, paid authorised, or shared with explicit property-owner permission. */
  access: ParkingAccess;
  /** Only "authorised" and "shared-permission" can ever be recommended. */
  authorisation: Authorisation;
  note?: string;
  lat: number;
  lng: number;
  capacity: number;
  /** Relative popularity vs. the area's demand curve (1 = average). */
  demandFactor: number;
  firstHour: number;
  perHourAfter: number;
  dailyMax?: number;
  openFrom: number; // hour, 0-24
  openTo: number; // hour, 0-24 (24 = midnight)
};

export type Area = {
  id: AreaId;
  name: string;
  short: string;
  tagline: string;
  center: [number, number];
  zoom: number;
  /** Occupancy fraction (0-1) by hour, 0..23 */
  demand: { weekday: number[]; weekend: number[] };
  restaurants: Restaurant[];
  parkings: Parking[];
  /** No-parking / tow-away zones (illustrative). Never used for parking. */
  zones: RestrictedZone[];
};

const HKV_WEEKDAY = [0.15, 0.1, 0.08, 0.06, 0.05, 0.05, 0.08, 0.12, 0.2, 0.28, 0.35, 0.45, 0.58, 0.62, 0.55, 0.48, 0.5, 0.58, 0.68, 0.76, 0.82, 0.8, 0.66, 0.4];
const HKV_WEEKEND = [0.35, 0.22, 0.12, 0.08, 0.06, 0.06, 0.08, 0.12, 0.2, 0.3, 0.42, 0.55, 0.68, 0.74, 0.7, 0.66, 0.7, 0.78, 0.86, 0.92, 0.96, 0.95, 0.85, 0.62];
const KHAN_WEEKDAY = [0.08, 0.05, 0.04, 0.04, 0.04, 0.05, 0.08, 0.14, 0.25, 0.4, 0.55, 0.68, 0.78, 0.82, 0.76, 0.7, 0.72, 0.8, 0.86, 0.9, 0.88, 0.78, 0.55, 0.25];
const KHAN_WEEKEND = [0.12, 0.08, 0.05, 0.04, 0.04, 0.05, 0.08, 0.15, 0.28, 0.45, 0.62, 0.76, 0.86, 0.9, 0.86, 0.82, 0.84, 0.9, 0.94, 0.95, 0.92, 0.82, 0.6, 0.3];
const CP_WEEKDAY = [0.1, 0.06, 0.05, 0.04, 0.04, 0.06, 0.12, 0.25, 0.48, 0.68, 0.8, 0.84, 0.86, 0.85, 0.82, 0.8, 0.8, 0.78, 0.74, 0.72, 0.7, 0.6, 0.42, 0.2];
const CP_WEEKEND = [0.2, 0.12, 0.08, 0.05, 0.05, 0.06, 0.1, 0.18, 0.3, 0.45, 0.6, 0.72, 0.8, 0.84, 0.84, 0.82, 0.84, 0.86, 0.88, 0.9, 0.88, 0.78, 0.58, 0.32];

export const AREAS: Record<AreaId, Area> = {
  hkv: {
    id: "hkv",
    name: "Hauz Khas Village",
    short: "HKV",
    tagline: "Lakeside cafés, medieval ruins and some of South Delhi's busiest evening lanes.",
    center: [28.5539, 77.1942],
    zoom: 16,
    demand: { weekday: HKV_WEEKDAY, weekend: HKV_WEEKEND },
    restaurants: [
      { id: "hkv-lakeview", name: "Lakeview Terrace Café", cuisine: "Café", price: 2, rating: 4.5, lat: 28.5547, lng: 77.1928, blurb: "Terrace seating facing the Hauz Khas lake." },
      { id: "hkv-tomb", name: "Tomb Garden Bistro", cuisine: "Continental", price: 3, rating: 4.4, lat: 28.5541, lng: 77.1922, blurb: "Candle-lit bistro beside the madrasa ruins." },
      { id: "hkv-masala", name: "Masala Courtyard", cuisine: "North Indian", price: 2, rating: 4.3, lat: 28.5534, lng: 77.1938, blurb: "Open courtyard, tandoor and live ghazals." },
      { id: "hkv-brew", name: "Deer Park Brew Co.", cuisine: "Café & Brewery", price: 3, rating: 4.2, lat: 28.5553, lng: 77.1936, blurb: "Small-batch brews and wood-fired pizza." },
      { id: "hkv-rooftop", name: "Village Rooftop Kitchen", cuisine: "Pan-Asian", price: 3, rating: 4.1, lat: 28.5529, lng: 77.1932, blurb: "Rooftop dining over the village lanes." },
      { id: "hkv-baoli", name: "Baoli Bakehouse", cuisine: "Bakery & Café", price: 1, rating: 4.6, lat: 28.5538, lng: 77.1946, blurb: "Sourdough, filter coffee and quiet corners." },
      { id: "hkv-saffron", name: "Saffron Lane", cuisine: "Mughlai", price: 2, rating: 4.0, lat: 28.5525, lng: 77.194, blurb: "Slow-cooked kebabs and biryani." },
      { id: "hkv-monsoon", name: "Monsoon Noodle Bar", cuisine: "Asian", price: 2, rating: 4.2, lat: 28.5544, lng: 77.195, blurb: "Hand-pulled noodles and dumplings." },
    ],
    zones: [
      { id: "hkv-z-road", name: "Hauz Khas Village Road", reason: "No-parking, tow-away enforced", center: [28.5537, 77.1957], radius: 55 },
      { id: "hkv-z-deer", name: "Deer Park entrance lane", reason: "Emergency access — no parking", center: [28.5565, 77.1931], radius: 40 },
    ],
    parkings: [
      { id: "hkv-p-gate", name: "HKV Main Gate Authorised Parking", operator: "MCD (authorised contractor)", kind: "Surface", verified: true, access: "paid", authorisation: "authorised", lat: 28.5531, lng: 77.1958, capacity: 220, demandFactor: 1.12, firstHour: 60, perHourAfter: 40, dailyMax: 300, openFrom: 8, openTo: 24 },
      { id: "hkv-p-deer", name: "Deer Park Gate Authorised Parking", operator: "DDA", kind: "Surface", verified: true, access: "paid", authorisation: "authorised", lat: 28.5568, lng: 77.194, capacity: 120, demandFactor: 0.86, firstHour: 30, perHourAfter: 20, dailyMax: 150, openFrom: 6, openTo: 22 },
      { id: "hkv-p-enclave", name: "Hauz Khas Enclave Pay & Park", operator: "MCD", kind: "Surface", verified: true, access: "paid", authorisation: "authorised", lat: 28.551, lng: 77.1985, capacity: 80, demandFactor: 0.95, firstHour: 40, perHourAfter: 30, dailyMax: 200, openFrom: 8, openTo: 23 },
      { id: "hkv-p-market", name: "Hauz Khas Market Multi-level Parking", operator: "MCD", kind: "Multi-level", verified: true, access: "paid", authorisation: "authorised", lat: 28.5478, lng: 77.2018, capacity: 400, demandFactor: 0.68, firstHour: 40, perHourAfter: 20, dailyMax: 150, openFrom: 7, openTo: 24 },
      { id: "hkv-p-aurobindo", name: "Aurobindo Place Pay & Park", operator: "MCD", kind: "Surface", verified: true, access: "paid", authorisation: "authorised", lat: 28.5458, lng: 77.2003, capacity: 90, demandFactor: 0.9, firstHour: 20, perHourAfter: 20, dailyMax: 120, openFrom: 8, openTo: 22 },
      // Unverified roadside spot — kept in data only to prove it is filtered out.
      { id: "hkv-f-fort", name: "Hauz Khas Fort Road Free Parking", operator: "DDA", kind: "Surface", verified: true, access: "free", authorisation: "authorised", lat: 28.5561, lng: 77.1966, capacity: 60, demandFactor: 1.18, firstHour: 0, perHourAfter: 0, openFrom: 6, openTo: 22 },
      { id: "hkv-s-residency", name: "Lakeside Residency Shared Parking", operator: "Private owner (diner permission)", kind: "Surface", verified: true, access: "shared", authorisation: "shared-permission", note: "Owner permits diners; show your restaurant booking at the gate.", lat: 28.5523, lng: 77.1951, capacity: 25, demandFactor: 0.9, firstHour: 50, perHourAfter: 0, dailyMax: 50, openFrom: 11, openTo: 24 },
      { id: "hkv-x-towaway", name: "Lane outside Deer Park gate", operator: "Traffic police tow-away zone", kind: "Surface", verified: false, access: "paid", authorisation: "restricted", note: "Marked no-parking / tow-away zone.", lat: 28.5566, lng: 77.1931, capacity: 15, demandFactor: 1, firstHour: 0, perHourAfter: 0, openFrom: 0, openTo: 24 },
      { id: "hkv-x-roadside", name: "Roadside stretch, Hauz Khas Village Road", operator: "Unknown", kind: "Surface", verified: false, access: "paid", authorisation: "unverified", note: "Vacant roadside space — vacancy does not make it legal parking.", lat: 28.554, lng: 77.1953, capacity: 30, demandFactor: 1, firstHour: 0, perHourAfter: 0, openFrom: 0, openTo: 24 },
    ],
  },
  khan: {
    id: "khan",
    name: "Khan Market",
    short: "Khan",
    tagline: "Compact, upscale and notoriously tight on parking after 6 pm.",
    center: [28.6, 77.2268],
    zoom: 17,
    demand: { weekday: KHAN_WEEKDAY, weekend: KHAN_WEEKEND },
    restaurants: [
      { id: "khan-amber", name: "Amber Room Café", cuisine: "Café", price: 2, rating: 4.4, lat: 28.6003, lng: 77.2268, blurb: "First-floor café with big windows." },
      { id: "khan-middle", name: "Middle Lane Bistro", cuisine: "European", price: 3, rating: 4.5, lat: 28.6, lng: 77.2273, blurb: "Tiny bistro tucked in the middle lane." },
      { id: "khan-lodhi", name: "Lodhi Leaf Tea House", cuisine: "Tea & Snacks", price: 1, rating: 4.3, lat: 28.5997, lng: 77.2263, blurb: "Single-estate teas and small plates." },
      { id: "khan-ember", name: "Ember & Oak Grill", cuisine: "Grill", price: 3, rating: 4.2, lat: 28.6006, lng: 77.2277, blurb: "Charcoal grills and craft cocktails." },
      { id: "khan-chai", name: "Khan Chai Collective", cuisine: "Indian Street Food", price: 1, rating: 4.1, lat: 28.5994, lng: 77.227, blurb: "Chaat, chai and quick bites." },
    ],
    zones: [
      { id: "khan-z-middle", name: "Khan Market middle lane", reason: "Pedestrian lane — no vehicles", center: [28.6, 77.227], radius: 30 },
    ],
    parkings: [
      { id: "khan-p-front", name: "Khan Market Front Authorised Parking", operator: "NDMC", kind: "Surface", verified: true, access: "paid", authorisation: "authorised", lat: 28.6008, lng: 77.2262, capacity: 150, demandFactor: 1.12, firstHour: 40, perHourAfter: 30, dailyMax: 250, openFrom: 8, openTo: 23 },
      { id: "khan-p-rear", name: "Khan Market Rear Lane Parking", operator: "NDMC", kind: "Surface", verified: true, access: "paid", authorisation: "authorised", lat: 28.5995, lng: 77.2283, capacity: 110, demandFactor: 1.05, firstHour: 40, perHourAfter: 30, dailyMax: 250, openFrom: 8, openTo: 23 },
      { id: "khan-f-lodhi", name: "Lodhi Garden Gate 1 Free Parking", operator: "NDMC", kind: "Surface", verified: true, access: "free", authorisation: "authorised", lat: 28.5965, lng: 77.2236, capacity: 80, demandFactor: 1.0, firstHour: 0, perHourAfter: 0, openFrom: 6, openTo: 20 },
      { id: "khan-s-office", name: "Khan Market Office Block Shared Parking", operator: "Private owner (permission)", kind: "Surface", verified: true, access: "shared", authorisation: "shared-permission", note: "Owner permits evening/weekend visitors via the guard desk.", lat: 28.6013, lng: 77.2287, capacity: 30, demandFactor: 0.85, firstHour: 60, perHourAfter: 0, dailyMax: 60, openFrom: 10, openTo: 23 },
      { id: "khan-x-roadside", name: "Roadside near Khan Market rear lane", operator: "Unknown", kind: "Surface", verified: false, access: "paid", authorisation: "unverified", note: "Vacant roadside space — vacancy does not make it legal parking.", lat: 28.5991, lng: 77.2276, capacity: 10, demandFactor: 1, firstHour: 0, perHourAfter: 0, openFrom: 0, openTo: 24 },
      { id: "khan-p-lok", name: "Lok Nayak Bhawan Pay & Park", operator: "NDMC", kind: "Surface", verified: true, access: "paid", authorisation: "authorised", lat: 28.5983, lng: 77.2243, capacity: 200, demandFactor: 0.72, firstHour: 30, perHourAfter: 20, dailyMax: 150, openFrom: 7, openTo: 23 },
    ],
  },
  cp: {
    id: "cp",
    name: "Connaught Place",
    short: "CP",
    tagline: "Delhi's colonnaded heart — big underground lots, busy inner circle.",
    center: [28.6312, 77.2167],
    zoom: 16,
    demand: { weekday: CP_WEEKDAY, weekend: CP_WEEKEND },
    restaurants: [
      { id: "cp-arcade", name: "Circle Arcade Kitchen", cuisine: "Multi-cuisine", price: 2, rating: 4.2, lat: 28.632, lng: 77.2176, blurb: "Classic colonnade dining room." },
      { id: "cp-janpath", name: "Janpath Spice House", cuisine: "North Indian", price: 2, rating: 4.3, lat: 28.6284, lng: 77.2199, blurb: "Family-style curries near Janpath." },
      { id: "cp-colonnade", name: "Colonnade Coffee Roasters", cuisine: "Café", price: 1, rating: 4.5, lat: 28.6331, lng: 77.2159, blurb: "In-house roasted beans and bakes." },
      { id: "cp-radial", name: "Radial Road Diner", cuisine: "American", price: 2, rating: 4.0, lat: 28.6305, lng: 77.2143, blurb: "Burgers, shakes and booths." },
      { id: "cp-barakhamba", name: "Barakhamba Grill", cuisine: "Grill & Bar", price: 3, rating: 4.1, lat: 28.6312, lng: 77.2202, blurb: "Rooftop grill on the outer circle." },
    ],
    zones: [
      { id: "cp-z-outer", name: "Outer Circle (Block N)", reason: "Tow-away zone", center: [28.6338, 77.2196], radius: 45 },
    ],
    parkings: [
      { id: "cp-p-palika", name: "Palika Bazaar Underground Parking", operator: "NDMC", kind: "Underground", verified: true, access: "paid", authorisation: "authorised", lat: 28.6295, lng: 77.2186, capacity: 600, demandFactor: 0.9, firstHour: 30, perHourAfter: 20, dailyMax: 200, openFrom: 7, openTo: 24 },
      { id: "cp-p-shivaji", name: "Shivaji Stadium Multi-level Parking", operator: "NDMC", kind: "Multi-level", verified: true, access: "paid", authorisation: "authorised", lat: 28.6283, lng: 77.2123, capacity: 500, demandFactor: 0.7, firstHour: 30, perHourAfter: 20, dailyMax: 150, openFrom: 7, openTo: 24 },
      { id: "cp-p-bks", name: "Baba Kharak Singh Marg Multi-level", operator: "NDMC", kind: "Multi-level", verified: true, access: "paid", authorisation: "authorised", lat: 28.6262, lng: 77.2108, capacity: 800, demandFactor: 0.6, firstHour: 30, perHourAfter: 20, dailyMax: 150, openFrom: 7, openTo: 24 },
      { id: "cp-f-janpath", name: "Janpath Lane Free Parking", operator: "NDMC", kind: "Surface", verified: true, access: "free", authorisation: "authorised", lat: 28.6257, lng: 77.2192, capacity: 50, demandFactor: 1.15, firstHour: 0, perHourAfter: 0, openFrom: 8, openTo: 20 },
      { id: "cp-s-regal", name: "Regal Building Shared Parking", operator: "Private owner (permission)", kind: "Surface", verified: true, access: "shared", authorisation: "shared-permission", note: "Owner permits visitors with a same-day restaurant bill.", lat: 28.6301, lng: 77.2139, capacity: 40, demandFactor: 0.95, firstHour: 80, perHourAfter: 0, dailyMax: 80, openFrom: 10, openTo: 23 },
      { id: "cp-x-outer", name: "Outer Circle kerbside", operator: "Traffic police tow-away zone", kind: "Surface", verified: false, access: "paid", authorisation: "restricted", note: "Marked no-parking / tow-away stretch.", lat: 28.6338, lng: 77.2196, capacity: 20, demandFactor: 1, firstHour: 0, perHourAfter: 0, openFrom: 0, openTo: 24 },
      { id: "cp-p-blocka", name: "Inner Circle Block A Authorised Parking", operator: "NDMC", kind: "Surface", verified: true, access: "paid", authorisation: "authorised", lat: 28.6328, lng: 77.2182, capacity: 120, demandFactor: 1.2, firstHour: 50, perHourAfter: 40, dailyMax: 300, openFrom: 8, openTo: 23 },
    ],
  },
};

export const AREA_LIST: Area[] = [AREAS.hkv, AREAS.khan, AREAS.cp];

export function getArea(id: string): Area {
  return (AREAS as Record<string, Area>)[id] ?? AREAS.hkv;
}
