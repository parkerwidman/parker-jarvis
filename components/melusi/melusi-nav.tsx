"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type MelusiNavLink = {
  href: string;
  label: string;
  exact?: boolean;
  comingSoon?: boolean;
};

const MELUSI_NAV_LINKS: MelusiNavLink[] = [
  { href: "/melusi", label: "Overview", exact: true },
  { href: "/melusi/threads", label: "Threads", exact: false },
  { href: "/melusi#active-projects", label: "Projects", exact: false },
  { href: "/melusi/social", label: "Social" },
  { href: "/melusi/revenue", label: "Revenue", comingSoon: true },
  { href: "/melusi/knowledge", label: "Knowledge", comingSoon: true },
];

function isActive(pathname: string, href: string, exact: boolean): boolean {
  if (exact) {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function MelusiNav() {
  const pathname = usePathname();

  return (
    <nav className="melusi-nav" aria-label="Melusi navigation">
      {MELUSI_NAV_LINKS.map((link) => {
        if (link.comingSoon) {
          return (
            <Link
              key={link.href}
              href={link.href}
              className="melusi-nav-link melusi-nav-link--soon"
              aria-disabled="true"
            >
              {link.label}
              <span className="melusi-nav-tag">Soon</span>
            </Link>
          );
        }

        const active = isActive(pathname, link.href, link.exact ?? false);

        return (
          <Link
            key={link.href}
            href={link.href}
            className={`melusi-nav-link${active ? " melusi-nav-link--active" : ""}`}
            aria-current={active ? "page" : undefined}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
