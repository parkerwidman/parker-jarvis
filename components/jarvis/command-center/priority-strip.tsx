"use client";

import { useCommandCenterMode } from "./command-center-mode-provider";
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

  const eyebrow = `#1 ${modeLabel(mode).toLowerCase()} priority`;
  const title = modeFocus?.title ?? `No ${modeLabel(mode).toLowerCase()} priority right now`;

  return (
    <div className="cc2-priority-strip" role="status">
      <span className="cc2-priority-eyebrow">{eyebrow}</span>
      <span className="cc2-priority-title">{title}</span>
      {!modeFocus ? (
        <span className="cc2-priority-sub">{headerStatus}</span>
      ) : null}
    </div>
  );
}
