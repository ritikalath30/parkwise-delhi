// Normalised place data. Every field that a data source did not provide is null — the UI
// shows "Unknown" for it. Nothing here is invented.

/** Opening hours per weekday (0 = Monday … 6 = Sunday) as [startMin, endMin) ranges; end may exceed 1440 (past midnight). */
export type WeeklyHours = [number, number][][];

export type Restaurant = {
  id: string;
  name: string;
  cuisine: string | null;
  lat: number;
  lng: number;
  openingHours: string | null;
  hours: WeeklyHours | null;
  address: string | null;
  website: string | null;
  source: "osm";
};

/** FREE / PAID: public parking with a known fee status. FEE_UNKNOWN: public but fee not recorded.
 *  SHARED: private parking offered with explicit owner permission — needs a partner source (none integrated yet). */
export type ParkingCategory = "free" | "paid" | "shared" | "fee-unknown";
export type ParkingKind = "surface" | "multi-storey" | "underground" | "rooftop" | "street-side" | "unknown";

export type Charge = { amount: number; currency: "INR"; per: "hour" | "day" | "visit" };

export type Parking = {
  id: string;
  name: string | null;
  lat: number;
  lng: number;
  category: ParkingCategory;
  kind: ParkingKind;
  /** Raw OSM access tag (null = not tagged, treated as public per OSM convention for amenity=parking). */
  accessTag: string | null;
  fee: "yes" | "no" | "unknown";
  charge: Charge | null;
  chargeRaw: string | null;
  capacity: { value: number; source: "osm-tag" | "mapped-area" } | null;
  areaM2: number | null;
  openingHours: string | null;
  hours: WeeklyHours | null;
  facts: { lit: boolean | null; supervised: boolean | null; surveillance: boolean | null; covered: boolean | null };
  operator: string | null;
  source: "osm";
  url: string;
};

/** Parking that exists in the data but must never be recommended (private, customers-only, no access…). */
export type ExcludedParking = { id: string; name: string | null; lat: number; lng: number; reason: string; url: string };

export type PlaceData = {
  center: { lat: number; lng: number };
  restaurants: Restaurant[];
  parkings: Parking[];
  excluded: ExcludedParking[];
  /** Shops + food places within 500 m — a proxy for commercial activity used by the demand model. */
  activityCount: number | null;
  /** OSM walking distances in metres, keyed `${parkingId}>${restaurantId}`; null when routing failed. */
  routes: Record<string, number> | null;
  fetchedAt: string;
  sources: { places: string; routes: string | null };
  error: string | null;
};

export type GeocodeResult = { id: string; label: string; detail: string; lat: number; lng: number; kind: string };
