export type MapPin = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  dim?: boolean | undefined;
  status?: "good" | "limited" | "scarce" | "closed" | undefined;
  /** Parking marker style: free / paid / shared / restricted (never recommended). */
  variant?: "free" | "paid" | "shared" | "restricted" | undefined;
  /** Lines shown in the marker's popup (plain text, escaped by the map). */
  popupLines?: string[] | undefined;
};

export type MapViewProps = {
  center: [number, number];
  zoom: number;
  fitKey: string;
  restaurants: MapPin[];
  parkings: MapPin[];
  selectedRestaurantId?: string | null | undefined;
  selectedParkingId?: string | null | undefined;
  onSelectRestaurant?: ((id: string) => void) | undefined;
  onSelectParking?: ((id: string) => void) | undefined;
  route?: [number, number][] | null | undefined;
  walkCircle?: { center: [number, number]; radius: number } | null | undefined;
  className?: string | undefined;
  /** Leaflet popups on marker click; turn off when the page shows its own detail card. */
  showPopups?: boolean | undefined;
  /** Restricted / no-parking zones drawn as red hatched circles. */
  zones?: { id: string; name: string; reason: string; center: [number, number]; radius: number }[] | undefined;
};
