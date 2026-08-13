import Link from "next/link";
import type { ReactNode } from "react";
import {
  MelusiActiveProjectsKpiIcon,
  MelusiKpiRingIcon,
  MelusiOpenTasksKpiIcon,
  MelusiSocialKpiIcon,
  MelusiUpdateKpiIcon,
} from "@/components/melusi/melusi-icons";
import type { MelusiKpiItem } from "@/lib/jarvis/melusi/build-melusi-command-center-view";

const KPI_ICONS: Record<string, ReactNode> = {
  "kpi-active-projects": <MelusiActiveProjectsKpiIcon />,
  "kpi-open-tasks": <MelusiOpenTasksKpiIcon />,
  "kpi-social": <MelusiSocialKpiIcon />,
  "kpi-latest-update": <MelusiUpdateKpiIcon />,
};

export function MelusiBusinessSnapshotStrip({
  items,
}: {
  items: MelusiKpiItem[];
}) {
  if (items.length === 0) {
    return null;
  }

  return (
    <section className="melusi-kpi-strip melusi-glass-surface" aria-label="Business KPIs">
      {items.map((item, index) => (
        <div key={item.id} className="melusi-kpi-cell-wrap">
          <div
            className={`melusi-kpi-cell${item.tone ? ` melusi-kpi-cell--${item.tone}` : ""}`}
          >
            <MelusiKpiRingIcon>{KPI_ICONS[item.id]}</MelusiKpiRingIcon>
            <div className="melusi-kpi-cell-copy">
              <span className="melusi-kpi-cell-label">{item.label}</span>
              {item.href ? (
                <Link href={item.href} className="melusi-kpi-cell-value">
                  {item.value}
                </Link>
              ) : (
                <span className="melusi-kpi-cell-value">{item.value}</span>
              )}
            </div>
          </div>
          {index < items.length - 1 ? (
            <span className="melusi-kpi-divider" aria-hidden="true" />
          ) : null}
        </div>
      ))}
    </section>
  );
}
