import { ScheduleLegendCategoryIcon } from "@/lib/jarvis/schedule/schedule-category-icons";
import {
  getScheduleCategoryClassName,
  getScheduleCategoryLabel,
  sortCategoriesForLegend,
} from "@/lib/jarvis/schedule/schedule-category-styles";
import type { ScheduleCategory } from "@/lib/jarvis/schedule/schedule-types";

type ScheduleLegendProps = {
  categories: ScheduleCategory[];
};

export function ScheduleLegend({ categories }: ScheduleLegendProps) {
  const sorted = sortCategoriesForLegend(categories);

  if (sorted.length === 0) {
    return null;
  }

  return (
    <div className="schedule-legend" aria-label="Schedule category legend">
      {sorted.map((category) => (
        <div key={category} className="schedule-legend-item">
          <span
            className={`schedule-legend-swatch ${getScheduleCategoryClassName(category)}`}
            aria-hidden="true"
          >
            <ScheduleLegendCategoryIcon category={category} />
          </span>
          <span className="schedule-legend-label">
            {getScheduleCategoryLabel(category)}
          </span>
        </div>
      ))}
    </div>
  );
}
