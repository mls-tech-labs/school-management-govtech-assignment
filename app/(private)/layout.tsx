import type { ReactNode } from "react";
import { RouteGuard } from "@/lib/auth/route-guard";

/**
 * `app/(private)/layout.tsx` — the Next.js parentheses-syntax
 * route-group layout. Wraps every page inside `(private)/` in
 * `<RouteGuard>` so the page is automatically protected without
 * each page importing the guard explicitly.
 *
 * The parentheses do NOT appear in the URL — `app/(private)/teachers/page.tsx`
 * is reachable at `/teachers`, the same as before. The route group
 * is purely a layout-composition construct.
 */
export default function PrivateLayout({ children }: { children: ReactNode }) {
  return <RouteGuard>{children}</RouteGuard>;
}
