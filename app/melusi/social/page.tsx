import { JarvisAppShell } from "@/components/jarvis/jarvis-app-shell";
import { MelusiNav } from "@/components/melusi/melusi-nav";
import { JarvisEmptyState, JarvisPageContent } from "@/components/jarvis/jarvis-ui";
import Link from "next/link";

type SetupPageProps = {
  title: string;
  description: string;
  integrations: string[];
};

function MelusiSetupPage({ title, description, integrations }: SetupPageProps) {
  return (
    <JarvisAppShell mainClassName="app-main--life-area">
      <JarvisPageContent className="jv-page-content--melusi">
        <header className="melusi-header">
          <div className="melusi-header-copy">
            <Link href="/melusi" className="jv-back-link">
              ← Melusi Command Center
            </Link>
            <h1 className="melusi-title">{title}</h1>
            <p className="melusi-subtitle">{description}</p>
          </div>
        </header>

        <MelusiNav />

        <JarvisEmptyState
          title="Not connected yet"
          description={`Planned integrations: ${integrations.join(", ")}. No data is shown until a trusted connection is added.`}
        />
      </JarvisPageContent>
    </JarvisAppShell>
  );
}

export default function MelusiSocialPage() {
  return (
    <MelusiSetupPage
      title="Social"
      description="Social performance and publishing will live here after Metricool and social platform integrations are connected."
      integrations={["Metricool", "social platforms"]}
    />
  );
}
