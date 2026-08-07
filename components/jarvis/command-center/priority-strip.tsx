"use client";

import { buildFocusPriorityFromTask } from "@/lib/jarvis/dashboard/focus-timer";
import { useCommandCenterMode } from "./command-center-mode-provider";
import { PriorityFocusControls } from "./priority-focus-controls";
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

  const eyebrow = `#1 ${modeLabel(mode).toLowerCase()} priority`;
  const defaultTitle =
    modeFocus?.title ??
    `No ${modeLabel(mode).toLowerCase()} priority right now`;
  const title =
    timer.phase === "idle" ? defaultTitle : (timer.displayTitle ?? defaultTitle);

  return (
    <div className="cc2-priority-strip" role="region" aria-label="Top priority">
      <div className="cc2-priority-main">
        <span className="cc2-priority-eyebrow">{eyebrow}</span>
        <span className="cc2-priority-title">{title}</span>
        {!modeFocus && timer.phase === "idle" ? (
          <span className="cc2-priority-sub">{headerStatus}</span>
        ) : null}
      </div>

      <PriorityFocusControls focusTask={modeFocus} timer={timer} />
    </div>
  );
}
