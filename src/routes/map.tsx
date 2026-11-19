import { createFileRoute, redirect } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { cleanSearch, criteriaSearchSchema } from "@/lib/search";

// Old screens, merged into /explore. Keep shared links working (legacy ?area= is resolved to coordinates).
export const Route = createFileRoute("/map")({
  validateSearch: zodValidator(criteriaSearchSchema),
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/explore", search: cleanSearch(search), statusCode: 301 });
  },
});
