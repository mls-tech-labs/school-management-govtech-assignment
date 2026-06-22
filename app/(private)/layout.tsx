import type { ReactNode } from "react";
import { RouteGuard } from "@/lib/auth/route-guard";

// Route group — the `(private)` segment is dropped from the URL.
// Every page under this group is wrapped in `<RouteGuard>`.
export default function PrivateLayout({ children }: { children: ReactNode }) {
  return <RouteGuard>{children}</RouteGuard>;
}
