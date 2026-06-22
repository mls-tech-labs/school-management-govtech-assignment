"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { getCsrfToken } from "@/lib/security/csrf-client";

const NAV = [
  { href: "/classes", label: "Classes" },
  { href: "/teachers", label: "Teachers" },
] as const;

// Re-runs /me on every pathname change so the header updates when the
// user signs in/out without a manual refresh.
export function SiteHeader() {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

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
        <div className="flex items-center gap-8">
          <Link href="/teachers" className="flex items-center gap-2 font-bold">
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
