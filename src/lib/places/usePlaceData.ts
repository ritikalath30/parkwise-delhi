import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getPlaceData } from "./functions";

/** Place data for a destination, shared by Explore and Plan through the query cache. */
export function usePlaceData(lat: number | undefined, lng: number | undefined) {
  const fetchPlaces = useServerFn(getPlaceData);
  return useQuery({
    queryKey: ["places", lat?.toFixed(3), lng?.toFixed(3)],
    queryFn: () => fetchPlaces({ data: { lat: lat!, lng: lng! } }),
    enabled: lat !== undefined && lng !== undefined,
    staleTime: 30 * 60_000,
    retry: 1,
  });
}
