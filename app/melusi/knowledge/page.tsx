import { JarvisAppShell } from "@/components/jarvis/jarvis-app-shell";
import { MelusiNav } from "@/components/melusi/melusi-nav";
import { JarvisEmptyState, JarvisPageContent } from "@/components/jarvis/jarvis-ui";
import Link from "next/link";

export default function MelusiKnowledgePage() {
  return (
    <JarvisAppShell mainClassName="app-main--life-area">
      <JarvisPageContent className="jv-page-content--melusi">
        <header className="melusi-header">
          <div className="melusi-header-copy">
            <Link href="/melusi" className="jv-back-link">
              ← Melusi Command Center
            </Link>
            <h1 className="melusi-title">Knowledge</h1>
            <p className="melusi-subtitle">
              Melusi knowledge search and document ingestion will live here when
              connected.
            </p>
          </div>
        </header>

        <MelusiNav />

        <JarvisEmptyState
          title="Not connected yet"
          description="Document ingestion and knowledge search are not connected yet. Melusi Jarvis can still use stored projects, tasks, and project updates."
        />
      </JarvisPageContent>
    </JarvisAppShell>
  );
}
