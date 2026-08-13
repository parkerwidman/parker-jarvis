import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  getScheduleCategoryIconName,
} from "@/lib/jarvis/schedule/schedule-category-icons";
import {
  getScheduleCategoryClassName,
  sortCategoriesForLegend,
} from "@/lib/jarvis/schedule/schedule-category-styles";
import { FALL_2026_BASELINE_ITEMS } from "@/lib/jarvis/schedule/fall-2026-baseline-template";
import { resolveScheduleOccurrences } from "@/lib/jarvis/schedule/resolve-schedule-occurrences";
import type { JarvisSchedule, ScheduleCategory } from "@/lib/jarvis/schedule/schedule-types";
import {
  buildCompactTimeLabel,
  buildScheduleWeekViewModel,
  getWeekEnd,
} from "@/lib/jarvis/schedule/schedule-week-view";

const BASE_SCHEDULE: JarvisSchedule = {
  id: "00000000-0000-4000-8000-000000000001",
  userId: "00000000-0000-4000-8000-000000000002",
  name: "Fall 2026 — Aug 24 to Oct 18",
  description: null,
  startDate: "2026-08-24",
  endDate: "2026-10-18",
  timezone: "America/Chicago",
  status: "active",
  createdAt: "2026-08-13T00:00:00.000Z",
  updatedAt: "2026-08-13T00:00:00.000Z",
};

function baselineItemsAsScheduleItems() {
  return FALL_2026_BASELINE_ITEMS.map((item, index) => ({
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    scheduleId: BASE_SCHEDULE.id,
    userId: BASE_SCHEDULE.userId,
    title: item.title,
    category: item.category,
    dayOfWeek: item.dayOfWeek,
    startTime: item.startTime,
    endTime: item.endTime,
    effectiveStartDate: BASE_SCHEDULE.startDate,
    effectiveEndDate: BASE_SCHEDULE.endDate,
    createdAt: "2026-08-13T00:00:00.000Z",
    updatedAt: "2026-08-13T00:00:00.000Z",
  }));
}

describe("schedule sidebar placement", () => {
  it("includes Schedule under LIFE after Fitness", () => {
    const sidebar = readFileSync("components/jarvis/jarvis-sidebar.tsx", "utf8");
    const lifeSection = sidebar.match(
      /title: "LIFE"[\s\S]*?links: \[([\s\S]*?)\]/,
    )?.[1];

    expect(lifeSection).toBeDefined();

    const hrefs = [...lifeSection!.matchAll(/href: "([^"]+)"/g)].map(
      (match) => match[1],
    );

    expect(hrefs).toEqual(["/finance", "/fitness", "/schedule"]);
  });

  it("does not include Schedule under ASSISTANT", () => {
    const sidebar = readFileSync("components/jarvis/jarvis-sidebar.tsx", "utf8");
    const assistantSection = sidebar.match(
      /title: "ASSISTANT"[\s\S]*?links: \[([\s\S]*?)\]/,
    )?.[1];

    expect(assistantSection).toBeDefined();

    const hrefs = [...assistantSection!.matchAll(/href: "([^"]+)"/g)].map(
      (match) => match[1],
    );

    expect(hrefs).toEqual([
      "/tasks",
      "/assistant",
      "/briefings",
      "/plans",
      "/approvals",
    ]);
  });

  it("does not workspace-filter the Schedule route in the sidebar", () => {
    const sidebar = readFileSync("components/jarvis/jarvis-sidebar.tsx", "utf8");

    expect(sidebar).toContain('href: "/schedule"');
    expect(sidebar).not.toContain("workspace");
  });
});

describe("schedule category icons", () => {
  const cases: Array<[ScheduleCategory, ReturnType<typeof getScheduleCategoryIconName>]> = [
    ["gym", "gym"],
    ["recovery", "gym"],
    ["morning_routine", "morning_routine"],
    ["work", "work"],
    ["class", "class"],
    ["reading", "reading"],
    ["night_routine", "night_routine"],
    ["sleep", "sleep"],
  ];

  it.each(cases)("maps %s to %s icon", (category, iconName) => {
    expect(getScheduleCategoryIconName(category)).toBe(iconName);
  });
});

describe("schedule category visual families", () => {
  it("maps recovery to the gym visual family", () => {
    expect(getScheduleCategoryClassName("recovery")).toBe("schedule-block--gym");
  });

  it("collapses recovery into gym for legend ordering", () => {
    expect(sortCategoriesForLegend(["recovery", "gym", "reading"])).toEqual([
      "gym",
      "reading",
    ]);
  });
});

describe("schedule block time presentation", () => {
  const items = baselineItemsAsScheduleItems();
  const weekStart = "2026-08-24";
  const weekEnd = getWeekEnd(weekStart);

  const occurrences = resolveScheduleOccurrences({
    schedule: BASE_SCHEDULE,
    items,
    overrides: [],
    startDate: weekStart,
    endDate: weekEnd,
  });

  const viewModel = buildScheduleWeekViewModel({
    weekStart,
    todayLocal: "2026-08-13",
    schedule: BASE_SCHEDULE,
    occurrences,
  });

  it("renders Reading time on short blocks", () => {
    const reading = viewModel.blocks.find(
      (block) => block.date === "2026-08-24" && block.title === "Reading",
    );

    expect(reading).toBeDefined();
    expect(reading?.displayTimeLabel).toBe("9:30–10:00 PM");
    expect(reading?.timeLabel).toBe("9:30 PM – 10:00 PM");
  });

  it("renders Night Routine time on short blocks", () => {
    const nightRoutine = viewModel.blocks.find(
      (block) => block.date === "2026-08-24" && block.title === "Night Routine",
    );

    expect(nightRoutine).toBeDefined();
    expect(nightRoutine?.displayTimeLabel).toBe("10:00–10:30 PM");
    expect(nightRoutine?.timeLabel).toBe("10:00 PM – 10:30 PM");
  });

  it("renders Lights Out open-ended time", () => {
    const lightsOut = viewModel.blocks.find(
      (block) => block.date === "2026-08-24" && block.title === "Lights Out",
    );

    expect(lightsOut).toBeDefined();
    expect(lightsOut?.displayTimeLabel).toBe("10:30 PM →");
    expect(lightsOut?.timeLabel).toBe("10:30 PM →");
  });

  it("keeps Active Recovery in the gym visual family without changing baseline times", () => {
    const activeRecovery = viewModel.blocks.find(
      (block) => block.date === "2026-08-30" && block.title === "Active Recovery",
    );

    expect(activeRecovery).toBeDefined();
    expect(activeRecovery?.category).toBe("recovery");
    expect(getScheduleCategoryClassName(activeRecovery!.category)).toBe(
      "schedule-block--gym",
    );
    expect(getScheduleCategoryIconName(activeRecovery!.category)).toBe("gym");
    expect(activeRecovery?.timeLabel).toBe("1:00 PM – 3:30 PM");
  });
});

describe("compact time label helper", () => {
  it("formats same-period ranges compactly", () => {
    expect(buildCompactTimeLabel("21:30", "22:00", false)).toBe("9:30–10:00 PM");
    expect(buildCompactTimeLabel("22:00", "22:30", false)).toBe("10:00–10:30 PM");
  });

  it("preserves open-ended Lights Out formatting", () => {
    expect(buildCompactTimeLabel("22:30", null, true)).toBe("10:30 PM →");
  });
});

describe("schedule data integrity", () => {
  it("does not change the 54-item baseline template", () => {
    expect(FALL_2026_BASELINE_ITEMS).toHaveLength(54);
  });
});
