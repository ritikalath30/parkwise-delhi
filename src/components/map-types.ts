export type MapPin = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  dim?: boolean | undefined;
  /** Predicted/live occupancy level colours the corner dot; omitted when unknown. */
  level?: "low" | "moderate" | "high" | "very-high" | null | undefined;
  /** Parking marker style. "excluded" = exists but never recommended (private / no public access). */
  variant?: "free" | "paid" | "shared" | "fee-unknown" | "excluded" | undefined;
};

export type MapViewProps = {
  center: [number, number];
  zoom: number;
  fitKey: string;
  restaurants: MapPin[];
  parkings: MapPin[];
  /** The searched destination, drawn as a distinct dot. */
  destination?: { lat: number; lng: number; name: string } | null | undefined;
  selectedRestaurantId?: string | null | undefined;
  selectedParkingId?: string | null | undefined;
  onSelectRestaurant?: ((id: string) => void) | undefined;
  onSelectParking?: ((id: string) => void) | undefined;
  route?: [number, number][] | null | undefined;
  /** Group nearby markers into clusters (Explore). */
  cluster?: boolean | undefined;
  className?: string | undefined;
};
