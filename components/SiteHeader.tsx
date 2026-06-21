"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { getCsrfToken } from "@/lib/security/csrf-client";

const NAV = [
  { href: "/classes", label: "Classes" },
  { href: "/teachers", label: "Teachers" },
] as const;

/**
 * Site-wide header. Three responsibilities:
 *
 *   1. Auth-aware visibility — the NAV (Classes / Teachers) and
 *      the "Sign out" button are BOTH hidden until `/api/v1.0/me`
 *      returns 200. On the `/login` page (and any future public
 *      page) the header shows ONLY the brand. This prevents a
 *      stale nav from linking to auth-gated routes while the
 *      user is signed out.
 *
 *   2. Reactive re-check on every navigation — the `/me` check
 *      re-runs whenever `usePathname()` changes, so the header
 *      updates immediately when the user signs in (login page
 *      navigates to `/`) or signs out (sign-out button navigates
 *      to `/login`). Without the `[pathname]` dep, the Sign Out
 *      button only appeared after a manual page refresh.
 *
 *   3. Layout — `[brand] [nav]` on the LEFT cluster, `Sign out`
 *      on the RIGHT cluster. The parent uses `justify-between`
 *      with two flex children so the right cluster stays
 *      hard-pinned to the far right regardless of nav length.
 */
export function SiteHeader() {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  // Re-check the session on every route change. The previous
  // version had `[]` deps, which meant the check ran only on
  // mount — and since SiteHeader lives in the root layout, it
  // doesn't remount on navigation. Switching the dep to
  // `[pathname]` makes the header reactive.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/v1.0/me", { cache: "no-store" });
        if (cancelled) return;
        setAuthed(res.ok);
      } catch {
        if (!cancelled) setAuthed(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  const onSignOut = useCallback(async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      const csrfToken = getCsrfToken() ?? "";
      await fetch("/api/v1.0/logout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
        },
      });
    } catch {
      // ignore — we navigate regardless
    } finally {
      setLoggingOut(false);
      router.replace("/login");
    }
  }, [loggingOut, router]);

  return (
    <header className="border-b border-surface-border bg-surface">
      <div className="container-page flex items-center justify-between py-3 px-4">
        {/* LEFT cluster: brand + (when authed) nav links. */}
        <div className="flex items-center gap-8">
          <Link
            href="/teachers"
            className="flex items-center gap-2 font-bold"
          >
            <span aria-hidden>🎓</span> School Portal
          </Link>

          {authed === true ? (
            <nav aria-label="Primary">
              <ul className="flex gap-6 list-none m-0 p-0">
                {NAV.map((item) => {
                  const active = pathname.startsWith(item.href);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={
                          active
                            ? "font-semibold border-b-2 border-primary-600 pb-0.5"
                            : "font-normal border-b-2 border-transparent pb-0.5"
                        }
                      >
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
          ) : null}
        </div>

        {/* RIGHT cluster: Sign out button. Same `authed === true`
            gate as the left cluster — both flash together so the
            header never shows a half-state (e.g. nav without
            sign out, or vice versa). */}
        {authed === true ? (
          <button
            type="button"
            onClick={onSignOut}
            disabled={loggingOut}
            className="text-sm text-primary-600 hover:text-primary-700 font-semibold disabled:opacity-50"
          >
            {loggingOut ? "Signing out…" : "Sign out"}
          </button>
        ) : null}
      </div>
    </header>
  );
}
