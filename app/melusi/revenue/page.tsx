import { JarvisAppShell } from "@/components/jarvis/jarvis-app-shell";
import { MelusiNav } from "@/components/melusi/melusi-nav";
import { JarvisEmptyState, JarvisPageContent } from "@/components/jarvis/jarvis-ui";
import Link from "next/link";

export default function MelusiRevenuePage() {
  return (
    <JarvisAppShell mainClassName="app-main--life-area">
      <JarvisPageContent className="jv-page-content--melusi">
        <header className="melusi-header">
          <div className="melusi-header-copy">
            <Link href="/melusi" className="jv-back-link">
              ← Melusi Command Center
            </Link>
            <h1 className="melusi-title">Revenue</h1>
            <p className="melusi-subtitle">
              Sales and revenue tracking will live here after Gumroad and Mercury
              integrations are connected.
            </p>
          </div>
        </header>

        <MelusiNav />

        <JarvisEmptyState
          title="Not connected yet"
          description="Planned integrations: Gumroad, Mercury. No revenue or sales data is shown until a trusted connection is added."
        />
      </JarvisPageContent>
    </JarvisAppShell>
  );
}
