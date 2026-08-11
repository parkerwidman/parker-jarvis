import Link from "next/link";

import { FitnessSyncControls } from "@/components/fitness/fitness-sync-controls";
import {
  JarvisCard,
  JarvisEmptyState,
  JarvisPageContent,
} from "@/components/jarvis/jarvis-ui";
import { JarvisPageHeader } from "@/components/jarvis/jarvis-page-header";
import type {
  FitnessBodySnapshot,
  FitnessCycleSnapshot,
  FitnessRecoverySnapshot,
  FitnessSleepSnapshot,
  FitnessTodaySnapshot,
  FitnessWorkoutSnapshot,
} from "@/lib/jarvis/fitness/fitness-today-types";

type FitnessDashboardProps = {
  snapshot: FitnessTodaySnapshot;
};

function MetricRow({
  label,
  value,
}: {
  label: string;
  value: string | number | null | undefined;
}) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-sm text-[var(--navy-muted)]">{label}</span>
      <span className="text-sm text-[var(--foreground)]">{value}</span>
    </div>
  );
}

function RecoveryCard({ recovery }: { recovery: FitnessRecoverySnapshot | null }) {
  if (!recovery) {
    return (
      <JarvisCard title="Recovery" accent="green">
        <p className="text-sm text-[var(--navy-muted)]">
          Recovery not recorded yet. More history will appear as WHOOP collects
          data.
        </p>
      </JarvisCard>
    );
  }

  if (recovery.displayState === "pending") {
    return (
      <JarvisCard title="Recovery" accent="green">
        <p className="text-base text-[var(--foreground)]">Recovery pending</p>
      </JarvisCard>
    );
  }

  if (recovery.displayState === "unscorable") {
    return (
      <JarvisCard title="Recovery" accent="green">
        <p className="text-base text-[var(--foreground)]">Recovery unavailable</p>
      </JarvisCard>
    );
  }

  return (
    <JarvisCard title="Recovery" accent="green">
      <div className="flex flex-col gap-4">
        <div>
          <div className="text-4xl font-semibold text-[var(--foreground)]">
            {recovery.score}
            <span className="ml-1 text-lg text-[var(--navy-muted)]">/ 100</span>
          </div>
          <p className="mt-1 text-sm text-[var(--foreground)]">
            {recovery.statusLabel}
          </p>
          <div
            className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--border)]"
            role="progressbar"
            aria-valuenow={recovery.score ?? 0}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Recovery score ${recovery.score} out of 100, ${recovery.statusLabel}`}
          >
            <div
              className={`h-full rounded-full ${
                recovery.statusLevel === "strong"
                  ? "bg-emerald-400"
                  : recovery.statusLevel === "moderate"
                    ? "bg-amber-400"
                    : "bg-rose-400"
              }`}
              style={{ width: `${Math.max(0, Math.min(100, recovery.score ?? 0))}%` }}
            />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <MetricRow
            label="HRV"
            value={
              recovery.hrvMilli != null ? `${recovery.hrvMilli.toFixed(1)} ms` : null
            }
          />
          <MetricRow
            label="Resting HR"
            value={
              recovery.restingHeartRate != null
                ? `${Math.round(recovery.restingHeartRate)} bpm`
                : null
            }
          />
          <MetricRow
            label="SpO2"
            value={
              recovery.spo2 != null ? `${recovery.spo2.toFixed(1)}%` : null
            }
          />
          <MetricRow
            label="Skin temp"
            value={
              recovery.skinTempCelsius != null
                ? `${recovery.skinTempCelsius.toFixed(1)} °C`
                : null
            }
          />
        </div>
      </div>
    </JarvisCard>
  );
}

function SleepCard({ sleep }: { sleep: FitnessSleepSnapshot | null }) {
  if (!sleep) {
    return (
      <JarvisCard title="Sleep" accent="blue">
        <p className="text-sm text-[var(--navy-muted)]">
          Sleep not recorded yet. More history will appear as WHOOP collects data.
        </p>
      </JarvisCard>
    );
  }

  if (sleep.displayState === "pending") {
    return (
      <JarvisCard title="Sleep" accent="blue">
        <p className="text-base text-[var(--foreground)]">Sleep pending</p>
      </JarvisCard>
    );
  }

  if (sleep.displayState === "unscorable") {
    return (
      <JarvisCard title="Sleep" accent="blue">
        <p className="text-base text-[var(--foreground)]">Sleep unavailable</p>
      </JarvisCard>
    );
  }

  return (
    <JarvisCard title={sleep.isNap ? "Sleep (Nap)" : "Sleep"} accent="blue">
      <div className="flex flex-col gap-4">
        <div>
          <div className="text-4xl font-semibold text-[var(--foreground)]">
            {sleep.performancePct != null
              ? `${Math.round(sleep.performancePct)}%`
              : "—"}
          </div>
          <p className="mt-1 text-sm text-[var(--navy-muted)]">
            Sleep performance
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <MetricRow label="Total sleep" value={sleep.totalSleepLabel} />
          <MetricRow
            label="Efficiency"
            value={
              sleep.efficiencyPct != null
                ? `${Math.round(sleep.efficiencyPct)}%`
                : null
            }
          />
          <MetricRow
            label="Consistency"
            value={
              sleep.consistencyPct != null
                ? `${Math.round(sleep.consistencyPct)}%`
                : null
            }
          />
          <MetricRow
            label="Respiratory rate"
            value={
              sleep.respiratoryRate != null
                ? `${sleep.respiratoryRate.toFixed(1)} rpm`
                : null
            }
          />
          <MetricRow
            label="Sleep need baseline"
            value={
              sleep.sleepNeedBaselineMs != null
                ? `${Math.round(sleep.sleepNeedBaselineMs / 3_600_000)}h baseline`
                : null
            }
          />
        </div>
      </div>
    </JarvisCard>
  );
}

function StrainCard({ cycle }: { cycle: FitnessCycleSnapshot | null }) {
  if (!cycle) {
    return (
      <JarvisCard title="Day Strain" accent="amber">
        <p className="text-sm text-[var(--navy-muted)]">
          Day strain not recorded yet.
        </p>
      </JarvisCard>
    );
  }

  if (cycle.displayState === "pending") {
    return (
      <JarvisCard title="Day Strain" accent="amber">
        <p className="text-base text-[var(--foreground)]">Strain pending</p>
        {cycle.isCurrent ? (
          <p className="mt-2 text-sm text-[var(--navy-muted)]">Current cycle</p>
        ) : null}
      </JarvisCard>
    );
  }

  if (cycle.displayState === "unscorable") {
    return (
      <JarvisCard title="Day Strain" accent="amber">
        <p className="text-base text-[var(--foreground)]">Strain unavailable</p>
      </JarvisCard>
    );
  }

  return (
    <JarvisCard title="Day Strain" accent="amber">
      <div className="flex flex-col gap-4">
        <div>
          <div className="text-4xl font-semibold text-[var(--foreground)]">
            {cycle.strain != null ? cycle.strain.toFixed(1) : "—"}
          </div>
          <p className="mt-1 text-sm text-[var(--navy-muted)]">
            {cycle.isCurrent ? "Current cycle strain" : "Cycle strain"}
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <MetricRow
            label="Average HR"
            value={
              cycle.averageHeartRate != null
                ? `${cycle.averageHeartRate} bpm`
                : null
            }
          />
          <MetricRow
            label="Max HR"
            value={cycle.maxHeartRate != null ? `${cycle.maxHeartRate} bpm` : null}
          />
          <MetricRow
            label="Calories"
            value={cycle.kilocalories != null ? `${cycle.kilocalories} kcal` : null}
          />
        </div>
      </div>
    </JarvisCard>
  );
}

function WorkoutsCard({ workouts }: { workouts: FitnessWorkoutSnapshot[] }) {
  return (
    <JarvisCard title="Today's Workouts" accent="cyan" className="md:col-span-2 xl:col-span-1">
      {workouts.length === 0 ? (
        <p className="text-sm text-[var(--navy-muted)]">
          No workouts recorded today.
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {workouts.map((workout) => (
            <li
              key={`${workout.startAt}-${workout.sportName}`}
              className="rounded-lg border border-[var(--border)] p-4"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-base font-medium text-[var(--foreground)]">
                  {workout.sportName}
                </p>
                <p className="text-sm text-[var(--navy-muted)]">
                  {workout.startTimeLabel}
                </p>
              </div>
              <div className="mt-3 flex flex-col gap-2">
                <MetricRow label="Duration" value={workout.durationLabel} />
                <MetricRow
                  label="Strain"
                  value={
                    workout.strain != null ? workout.strain.toFixed(1) : "Pending"
                  }
                />
                <MetricRow
                  label="Average HR"
                  value={
                    workout.averageHeartRate != null
                      ? `${workout.averageHeartRate} bpm`
                      : null
                  }
                />
                <MetricRow
                  label="Max HR"
                  value={
                    workout.maxHeartRate != null ? `${workout.maxHeartRate} bpm` : null
                  }
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </JarvisCard>
  );
}

function BodyCard({ body }: { body: FitnessBodySnapshot | null }) {
  if (!body) {
    return null;
  }

  return (
    <JarvisCard title="Body Snapshot" accent="none">
      <div className="flex flex-col gap-2">
        <MetricRow
          label="Weight"
          value={
            body.weightPounds != null
              ? `${body.weightPounds} lb${
                  body.weightKilograms != null
                    ? ` (${body.weightKilograms.toFixed(1)} kg)`
                    : ""
                }`
              : null
          }
        />
        <MetricRow
          label="Max heart rate"
          value={body.maxHeartRate != null ? `${body.maxHeartRate} bpm` : null}
        />
      </div>
    </JarvisCard>
  );
}

export function FitnessDashboard({ snapshot }: FitnessDashboardProps) {
  if (!snapshot.connection.connected) {
    return (
      <JarvisPageContent className="jv-page-content--fitness">
        <JarvisPageHeader
          title="Fitness"
          subtitle="Today's WHOOP snapshot"
        />
        <JarvisEmptyState
          title="WHOOP isn't connected"
          description="Connect WHOOP to see recovery, sleep, strain, and workouts here."
        />
        <div className="mt-4">
          <Link
            href="/integrations/whoop"
            className="inline-flex items-center justify-center rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            Connect WHOOP
          </Link>
        </div>
      </JarvisPageContent>
    );
  }

  return (
    <JarvisPageContent className="jv-page-content--fitness">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <JarvisPageHeader
          title="Fitness"
          subtitle="Today's WHOOP snapshot"
          meta={<span>{snapshot.todayLabel}</span>}
        />
        <FitnessSyncControls
          syncInProgress={snapshot.connection.syncInProgress}
          syncFreshnessLabel={snapshot.syncFreshnessLabel}
          lastSyncedLabel={snapshot.lastSyncedLabel}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <RecoveryCard recovery={snapshot.recovery} />
        <SleepCard sleep={snapshot.sleep} />
        <StrainCard cycle={snapshot.cycle} />
        <WorkoutsCard workouts={snapshot.workouts} />
        <BodyCard body={snapshot.body} />
      </div>
    </JarvisPageContent>
  );
}
