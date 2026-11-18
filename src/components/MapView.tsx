import { lazy, Suspense } from "react";
import { ClientOnly } from "@tanstack/react-router";
import { MapPinned } from "lucide-react";
import type { MapViewProps } from "./map-types";
import { cn } from "@/lib/utils";

const ParkMap = lazy(() => import("./ParkMap"));

function MapSkeleton({ className }: { className?: string | undefined }) {
  return (
    <div className={cn("grid place-items-center bg-muted grid-paper", className)}>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <MapPinned className="h-4 w-4 animate-pulse" /> Loading map…
      </div>
    </div>
  );
}

export function MapView(props: MapViewProps) {
  return (
    <ClientOnly fallback={<MapSkeleton className={props.className} />}>
      <Suspense fallback={<MapSkeleton className={props.className} />}>
        <ParkMap {...props} />
      </Suspense>
    </ClientOnly>
  );
}
