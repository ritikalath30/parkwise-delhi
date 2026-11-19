import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { PlaceData } from "./types";

/** Place data for a destination (used by the Explore/Plan loaders; cached per ~100 m on the server). */
export const getPlaceData = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).parse(d))
  .handler(async ({ data }): Promise<PlaceData> => {
    const { loadPlaceData } = await import("./server");
    return loadPlaceData(data.lat, data.lng);
  });
