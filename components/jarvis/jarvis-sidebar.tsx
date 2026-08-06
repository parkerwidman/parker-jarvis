"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  JarvisBrandIcon,
  JarvisNavIcon,
  type JarvisNavIconName,
} from "./jarvis-nav-icons";

type SidebarLink = {
  href: string;
  label: string;
  icon: JarvisNavIconName;
};

const SIDEBAR_LINKS: SidebarLink[] = [
  { href: "/", label: "Command Center", icon: "command" },
  { href: "/melusi", label: "Melusi", icon: "melusi" },
  { href: "/finance", label: "Finance", icon: "finance" },
  { href: "/assistant", label: "Expanded Assistant", icon: "assistant" },
  { href: "/tasks", label: "Tasks", icon: "tasks" },
  { href: "/briefings", label: "Morning Brief", icon: "brief" },
  { href: "/plans", label: "Daily Plan", icon: "plan" },
  { href: "/approvals", label: "Approvals", icon: "approvals" },
  { href: "/connections/microsoft", label: "Microsoft Connection", icon: "microsoft" },
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

export function JarvisSidebar({ displayName, userEmail }: JarvisSidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="app-sidebar" aria-label="Main navigation">
      <div className="app-sidebar-brand">
        <span className="app-brand-mark" aria-hidden="true">
          <JarvisBrandIcon />
        </span>
        <span className="app-brand-text">JARVIS</span>
      </div>

      <nav className="app-nav" aria-label="Jarvis navigation">
        {SIDEBAR_LINKS.map((link) => {
          const active = isLinkActive(pathname, link.href);

          return (
            <Link
              key={link.href}
              href={link.href}
              className={`app-nav-link${active ? " app-nav-link--active" : ""}`}
              aria-current={active ? "page" : undefined}
            >
              <JarvisNavIcon name={link.icon} />
              <span className="app-nav-label">{link.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="app-sidebar-footer">
        <div className="app-profile">
          <span className="app-profile-avatar" aria-hidden="true">
            {displayName.charAt(0).toUpperCase()}
          </span>
          <div className="app-profile-info">
            <span className="app-profile-name">{displayName}</span>
            {userEmail ? (
              <span className="app-profile-email">{userEmail}</span>
            ) : null}
          </div>
        </div>
        <form action="/auth/signout" method="post">
          <button type="submit" className="app-signout">
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}
