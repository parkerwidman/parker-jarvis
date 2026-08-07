"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type SidebarLink = {
  href: string;
  label: string;
};

const PRIMARY_LINKS: SidebarLink[] = [
  { href: "/", label: "Command center" },
  { href: "/finance", label: "Finance" },
  { href: "/tasks", label: "Tasks" },
];

const SECONDARY_LINKS: SidebarLink[] = [
  { href: "/melusi", label: "Melusi" },
  { href: "/assistant", label: "Assistant" },
  { href: "/briefings", label: "Morning Brief" },
  { href: "/plans", label: "Daily Plan" },
  { href: "/approvals", label: "Approvals" },
  { href: "/connections/microsoft", label: "Microsoft" },
];

function isLinkActive(pathname: string, href: string): boolean {
  if (href === "/") {
    return pathname === "/";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

type JarvisSidebarProps = {
  displayName: string;
  userEmail: string | null;
};

function NavLink({ href, label }: SidebarLink) {
  const pathname = usePathname();
  const active = isLinkActive(pathname, href);

  return (
    <Link
      href={href}
      className={`cc2-nav-item${active ? " cc2-nav-item--active" : ""}`}
      aria-current={active ? "page" : undefined}
    >
      <span className="cc2-nav-dot" aria-hidden="true" />
      {label}
    </Link>
  );
}

export function JarvisSidebar({ displayName, userEmail }: JarvisSidebarProps) {
  return (
    <aside className="cc2-sidebar" aria-label="Main navigation">
      <div className="cc2-logo">
        <div className="cc2-logo-mark" aria-hidden="true" />
        <div className="cc2-logo-text">JARVIS</div>
      </div>

      <nav className="cc2-nav" aria-label="Jarvis navigation">
        {PRIMARY_LINKS.map((link) => (
          <NavLink key={link.href} {...link} />
        ))}
        <div className="cc2-nav-divider" aria-hidden="true" />
        {SECONDARY_LINKS.map((link) => (
          <NavLink key={link.href} {...link} />
        ))}
      </nav>

      <div className="cc2-profile">
        <div className="cc2-avatar" aria-hidden="true">
          {displayName.charAt(0).toUpperCase()}
        </div>
        <div>
          <div className="cc2-profile-name">{displayName}</div>
          {userEmail ? (
            <div className="cc2-profile-email">{userEmail}</div>
          ) : null}
        </div>
      </div>

      <form action="/auth/signout" method="post" className="cc2-signout-form">
        <button type="submit" className="cc2-signout">
          Sign out
        </button>
      </form>
    </aside>
  );
}
