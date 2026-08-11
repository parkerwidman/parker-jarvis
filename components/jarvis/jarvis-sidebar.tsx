"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type SidebarLink = {
  href: string;
  label: string;
};

type SidebarSection = {
  title: string;
  links: SidebarLink[];
};

const GOALS_LINKS: SidebarLink[] = [
  { href: "/goals/short-term", label: "Short Term Goals" },
  { href: "/goals/three-month", label: "3 Month Goals" },
  { href: "/goals/long-term", label: "Long Term Goals" },
];

const NAV_SECTIONS: SidebarSection[] = [
  {
    title: "JARVIS",
    links: [{ href: "/", label: "Command Center" }],
  },
  {
    title: "LIFE",
    links: [
      { href: "/finance", label: "Finance" },
      { href: "/fitness", label: "Fitness" },
    ],
  },
  {
    title: "GOALS",
    links: GOALS_LINKS,
  },
  {
    title: "MELUSI",
    links: [{ href: "/melusi", label: "Melusi" }],
  },
  {
    title: "ASSISTANT",
    links: [
      { href: "/tasks", label: "Tasks" },
      { href: "/assistant", label: "Assistant" },
      { href: "/briefings", label: "Morning Brief" },
      { href: "/plans", label: "Daily Plan" },
      { href: "/approvals", label: "Approvals" },
    ],
  },
  {
    title: "CONNECTIONS",
    links: [{ href: "/connections/microsoft", label: "Microsoft" }],
  },
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

function NavSection({
  title,
  links,
  divided,
}: SidebarSection & { divided: boolean }) {
  return (
    <div className={`cc2-nav-section${divided ? " cc2-nav-section--divided" : ""}`}>
      <div className="cc2-nav-section-title">{title}</div>
      {links.map((link) => (
        <NavLink key={link.href} {...link} />
      ))}
    </div>
  );
}

export function JarvisSidebar({ displayName, userEmail }: JarvisSidebarProps) {
  return (
    <aside className="cc2-sidebar" aria-label="Main navigation">
      <div className="cc2-logo">
        <div className="cc2-logo-mark" aria-hidden="true" />
      </div>

      <nav className="cc2-nav" aria-label="Jarvis navigation">
        {NAV_SECTIONS.map((section, index) => (
          <NavSection key={section.title} {...section} divided={index > 0} />
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
