import { ScheduleCategoryIcon } from "@/lib/jarvis/schedule/schedule-category-icons";
import {
  getScheduleCategoryClassName,
} from "@/lib/jarvis/schedule/schedule-category-styles";
import type { ScheduleBlockViewModel } from "@/lib/jarvis/schedule/schedule-week-view";

type ScheduleBlockProps = {
  block: ScheduleBlockViewModel;
};

export function ScheduleBlock({ block }: ScheduleBlockProps) {
  const categoryClass = getScheduleCategoryClassName(block.category);
  const densityClass = block.dense
    ? " schedule-block--dense"
    : block.compact
      ? " schedule-block--compact"
      : "";

  return (
    <article
      className={`schedule-block ${categoryClass}${densityClass}${block.hasConflict ? " schedule-block--conflict" : ""}`}
      style={{
        top: `${block.topPx}px`,
        height: `${block.heightPx}px`,
      }}
      aria-label={block.ariaLabel}
      title={block.hasConflict ? `${block.ariaLabel} (overlap)` : block.ariaLabel}
    >
      <div className="schedule-block-accent" aria-hidden="true" />
      <div className="schedule-block-body">
        <div className="schedule-block-content">
          <ScheduleCategoryIcon category={block.category} />
          <div className="schedule-block-text">
            <div className="schedule-block-title">{block.title}</div>
            <div className="schedule-block-time">{block.displayTimeLabel}</div>
          </div>
        </div>
      </div>
      {block.hasConflict ? (
        <span className="schedule-block-conflict-indicator" aria-hidden="true" />
      ) : null}
    </article>
  );
}
