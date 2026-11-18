import { createFileRoute, redirect } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { cleanSearch, criteriaSearchSchema } from "@/lib/search";

// Map and AI picks were merged into /explore; keep old links (and shared URLs) working.
export const Route = createFileRoute("/recommendations")({
  validateSearch: zodValidator(criteriaSearchSchema),
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/explore", search: cleanSearch(search), statusCode: 301 });
  },
});
