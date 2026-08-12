"use client";

import Link from "next/link";

import { buildFocusPriorityFromTask } from "@/lib/jarvis/dashboard/focus-timer";
import { useCommandCenterMode } from "./command-center-mode-provider";
import { PriorityFocusControls } from "./priority-focus-controls";
import { PriorityOrbital, resolvePriorityOrbitalVariant } from "./priority-orbital";
import { usePersistentFocusTimer } from "./use-persistent-focus-timer";
import {
  itemMatchesMode,
  modeLabel,
} from "@/lib/jarvis/dashboard/command-center-mode";
import type { FocusTask } from "@/lib/jarvis/dashboard/build-command-center-view";

type PriorityStripProps = {
  focusTask: FocusTask | null;
  headerStatus: string;
};

export function PriorityStrip({ focusTask, headerStatus }: PriorityStripProps) {
  const { mode } = useCommandCenterMode();

  const modeFocus =
    focusTask && itemMatchesMode(focusTask.lifeAreaName, mode)
      ? focusTask
      : null;

  const currentPriority = modeFocus
    ? buildFocusPriorityFromTask(modeFocus)
    : null;

  const timer = usePersistentFocusTimer(currentPriority);

  const defaultTitle =
    modeFocus?.title ??
    `No ${modeLabel(mode).toLowerCase()} priority right now`;
  const title =
    timer.phase === "idle" ? defaultTitle : (timer.displayTitle ?? defaultTitle);

  const supportingCopy =
    modeFocus?.goalContext
      ? `${modeFocus.goalContext.goalTitle} → ${modeFocus.goalContext.levelTitle}`
      : modeFocus?.selectionReason ??
        (modeFocus ? undefined : headerStatus);

  return (
    <section
      id="cc2-priority-hero"
      className="cc2-priority-hero"
      role="region"
      aria-label="Top priority"
    >
      <PriorityOrbital variant={resolvePriorityOrbitalVariant(modeFocus?.title)} />

      <div className="cc2-priority-hero-main">
        <span className="cc2-priority-eyebrow">Top priority</span>
        <h2 className="cc2-priority-title">{title}</h2>
        {supportingCopy ? (
          <p className="cc2-priority-sub">{supportingCopy}</p>
        ) : null}
      </div>

      <div className="cc2-priority-hero-actions">
        <PriorityFocusControls
          focusTask={modeFocus}
          timer={timer}
          completePlacement="compact"
          trailingAction={
            timer.phase === "idle" ? (
              <Link href="/tasks" className="cc2-btn cc2-btn--ghost">
                View details
              </Link>
            ) : null
          }
        />
      </div>
    </section>
  );
}
