"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  JarvisBrandIcon,
  JarvisNavIcon,
  type JarvisNavIconName,
} from "@/components/jarvis/jarvis-nav-icons";
import {
  getJarvisNavDomain,
} from "@/lib/jarvis/shell/jarvis-domain";

type SidebarLink = {
  href: string;
  label: string;
  icon: JarvisNavIconName;
};

type SidebarSection = {
  title: string;
  links: SidebarLink[];
};

const GOALS_LINKS: SidebarLink[] = [
  { href: "/goals/short-term", label: "Short Term Goals", icon: "goals" },
  { href: "/goals/three-month", label: "3 Month Goals", icon: "goals" },
  { href: "/goals/long-term", label: "Long Term Goals", icon: "goals" },
];

const NAV_SECTIONS: SidebarSection[] = [
  {
    title: "JARVIS",
    links: [{ href: "/", label: "Command Center", icon: "command" }],
  },
  {
    title: "LIFE",
    links: [
      { href: "/finance", label: "Finance", icon: "finance" },
      { href: "/fitness", label: "Fitness", icon: "fitness" },
    ],
  },
  {
    title: "GOALS",
    links: GOALS_LINKS,
  },
  {
    title: "MELUSI",
    links: [{ href: "/melusi", label: "Melusi", icon: "melusi" }],
  },
  {
    title: "ASSISTANT",
    links: [
      { href: "/tasks", label: "Tasks", icon: "tasks" },
      { href: "/assistant", label: "Assistant", icon: "assistant" },
      { href: "/briefings", label: "Morning Brief", icon: "brief" },
      { href: "/plans", label: "Daily Plan", icon: "plan" },
      { href: "/approvals", label: "Approvals", icon: "approvals" },
    ],
  },
  {
    title: "CONNECTIONS",
    links: [{ href: "/connections/microsoft", label: "Microsoft", icon: "microsoft" }],
  },
];

function isLinkActive(pathname: string, href: string): boolean {
  if (href === "/") {
    return pathname === "/";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

function ProfileChevron() {
  return (
    <svg
      className="cc2-profile-chevron"
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M4.5 5.25L7 7.75L9.5 5.25"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type JarvisSidebarProps = {
  displayName: string;
  userEmail: string | null;
};

function NavLink({ href, label, icon }: SidebarLink) {
  const pathname = usePathname();
  const active = isLinkActive(pathname, href);
  const domain = getJarvisNavDomain(href);
  const activeClass = active ? " cc2-nav-item--active" : "";
  const domainClass = active ? ` cc2-nav-item--domain-${domain}` : "";

  return (
    <Link
      href={href}
      className={`cc2-nav-item${activeClass}${domainClass}`}
      aria-current={active ? "page" : undefined}
    >
      <JarvisNavIcon name={icon} />
      <span className="cc2-nav-label">{label}</span>
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
        <span className="cc2-logo-mark" aria-hidden="true">
          <JarvisBrandIcon />
        </span>
        <span className="cc2-logo-text">JARVIS</span>
      </div>

      <nav className="cc2-nav" aria-label="Jarvis navigation">
        {NAV_SECTIONS.map((section, index) => (
          <NavSection key={section.title} {...section} divided={index > 0} />
        ))}
      </nav>

      <div className="cc2-profile-card">
        <div className="cc2-profile">
          <div className="cc2-avatar" aria-hidden="true">
            {displayName.charAt(0).toUpperCase()}
          </div>
          <div className="cc2-profile-copy">
            <div className="cc2-profile-name">{displayName}</div>
            {userEmail ? (
              <div className="cc2-profile-email">{userEmail}</div>
            ) : null}
          </div>
          <ProfileChevron />
        </div>

        <form action="/auth/signout" method="post" className="cc2-signout-form">
          <button type="submit" className="cc2-signout">
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}
