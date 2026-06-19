"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/classes", label: "Classes" },
  { href: "/teachers", label: "Teachers" },
] as const;

export function SiteHeader() {
  const pathname = usePathname() ?? "/";
  return (
    <header className="border-b border-surface-border bg-surface">
      <div className="container-page flex items-center justify-between py-3 px-4">
        <Link
          href="/teachers"
          className="flex items-center gap-2 font-bold"
        >
          <span aria-hidden>🎓</span> School Portal
        </Link>
        <nav>
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
      </div>
    </header>
  );
}
