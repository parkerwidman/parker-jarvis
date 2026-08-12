import Link from "next/link";

import { FitnessBodySnapshotCard } from "@/components/fitness/fitness-body-snapshot";
import { FitnessFooterStrip } from "@/components/fitness/fitness-footer-strip";
import { FitnessInsightCard } from "@/components/fitness/fitness-insight-card";
import { FitnessQuickActions } from "@/components/fitness/fitness-quick-actions";
import { FitnessRecoveryCard } from "@/components/fitness/fitness-recovery-card";
import { FitnessRecoveryStatus } from "@/components/fitness/fitness-recovery-status";
import { FitnessSleepCard } from "@/components/fitness/fitness-sleep-card";
import { FitnessStrainCard } from "@/components/fitness/fitness-strain-card";
import { FitnessSyncControls } from "@/components/fitness/fitness-sync-controls";
import { FitnessTodayAtAGlance } from "@/components/fitness/fitness-today-at-a-glance";
import { FitnessTrendsChart } from "@/components/fitness/fitness-trends-chart";
import { FitnessWorkoutsCard } from "@/components/fitness/fitness-workouts-card";
import { JarvisEmptyState, JarvisPageContent } from "@/components/jarvis/jarvis-ui";
import type { FitnessTodaySnapshot } from "@/lib/jarvis/fitness/fitness-today-types";

type FitnessDashboardProps = {
  snapshot: FitnessTodaySnapshot;
};

export function FitnessDashboard({ snapshot }: FitnessDashboardProps) {
  if (!snapshot.connection.connected) {
    return (
      <JarvisPageContent className="jv-page-content--fitness">
        <header className="fit-header">
          <div className="fit-header-main">
            <h1 className="fit-title">Fitness</h1>
            <p className="fit-date">{snapshot.todayLabel}</p>
            <p className="fit-subtitle">Today&apos;s WHOOP snapshot</p>
          </div>
        </header>
        <JarvisEmptyState
          title="WHOOP isn't connected"
          description="Connect WHOOP to see recovery, sleep, strain, and workouts here."
        />
        <div className="fit-connect-cta">
          <Link href="/integrations/whoop" className="fit-connect-btn">
            Connect WHOOP
          </Link>
        </div>
      </JarvisPageContent>
    );
  }

  return (
    <JarvisPageContent className="jv-page-content--fitness">
      <div className="fit-main fit-main--dashboard">
        <header className="fit-header fit-header--dashboard">
          <div className="fit-header-main">
            <h1 className="fit-title">Fitness</h1>
            <p className="fit-date">{snapshot.todayLabel}</p>
            <p className="fit-subtitle">Today&apos;s WHOOP snapshot</p>
          </div>
          <FitnessSyncControls
            syncInProgress={snapshot.connection.syncInProgress}
            syncFreshnessLabel={snapshot.syncFreshnessLabel}
            lastSyncedLabel={snapshot.lastSyncedLabel}
          />
        </header>

        <div className="fit-dashboard-grid">
          <div className="fit-dashboard-main">
            <div className="fit-metric-row-grid">
              <FitnessRecoveryCard recovery={snapshot.recovery} />
              <FitnessSleepCard sleep={snapshot.sleep} />
              <FitnessStrainCard cycle={snapshot.cycle} />
            </div>

            <div className="fit-secondary-row">
              <FitnessWorkoutsCard workouts={snapshot.workouts} />
              <FitnessBodySnapshotCard body={snapshot.body} />
            </div>

            <div className="fit-lower-row">
              <FitnessTrendsChart trends={snapshot.trends} />
              <FitnessTodayAtAGlance glance={snapshot.glance} />
            </div>

            <FitnessFooterStrip displayName={snapshot.displayName} />
          </div>

          <aside className="fit-dashboard-rail" aria-label="Fitness status and actions">
            <FitnessRecoveryStatus recovery={snapshot.recovery} />
            <FitnessInsightCard
              recovery={snapshot.recovery}
              sleep={snapshot.sleep}
            />
            <FitnessQuickActions />
          </aside>
        </div>
      </div>
    </JarvisPageContent>
  );
}
