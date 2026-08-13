import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  FALL_2026_BASELINE_END_DATE,
  FALL_2026_BASELINE_ITEMS,
  FALL_2026_BASELINE_SCHEDULE_NAME,
  FALL_2026_BASELINE_START_DATE,
} from "@/lib/jarvis/schedule/fall-2026-baseline-template";
import { resolveScheduleOccurrences } from "@/lib/jarvis/schedule/resolve-schedule-occurrences";
import {
  getScheduleCategoryClassName,
  sortCategoriesForLegend,
} from "@/lib/jarvis/schedule/schedule-category-styles";
import type {
  JarvisSchedule,
  JarvisScheduleItem,
} from "@/lib/jarvis/schedule/schedule-types";
import {
  buildScheduleBlockLayout,
  buildScheduleWeekViewModel,
  getMondayWeekStart,
  getWeekEnd,
  parseWeekQueryParam,
  resolveDefaultWeekStart,
  resolveSelectedScheduleId,
  weekIntersectsSchedule,
} from "@/lib/jarvis/schedule/schedule-week-view";

const BASE_SCHEDULE: JarvisSchedule = {
  id: "schedule-fall-2026",
  userId: "user-1",
  name: FALL_2026_BASELINE_SCHEDULE_NAME,
  description: null,
  startDate: FALL_2026_BASELINE_START_DATE,
  endDate: FALL_2026_BASELINE_END_DATE,
  timezone: "America/Chicago",
  status: "active",
  createdAt: "2026-08-13T00:00:00.000Z",
  updatedAt: "2026-08-13T00:00:00.000Z",
};

function baselineItemsAsScheduleItems(): JarvisScheduleItem[] {
  return FALL_2026_BASELINE_ITEMS.map((item, index) => ({
    id: `baseline-item-${index}`,
    userId: "user-1",
    scheduleId: BASE_SCHEDULE.id,
    dayOfWeek: item.dayOfWeek,
    effectiveStartDate: item.effectiveStartDate,
    effectiveEndDate: item.effectiveEndDate,
    startTime: item.startTime.length === 5 ? `${item.startTime}:00` : item.startTime,
    endTime:
      item.endTime === null
        ? null
        : item.endTime.length === 5
          ? `${item.endTime}:00`
          : item.endTime,
    title: item.title,
    category: item.category,
    notes: null,
    metadata: {},
    sortOrder: item.sortOrder ?? 0,
    createdAt: "2026-08-13T00:00:00.000Z",
    updatedAt: "2026-08-13T00:00:00.000Z",
  }));
}

describe("schedule week view helpers", () => {
  it("defaults to the first schedule week when today is before the schedule start", () => {
    expect(resolveDefaultWeekStart("2026-08-13", BASE_SCHEDULE)).toBe("2026-08-24");
  });

  it("defaults to the current week when today is inside the schedule", () => {
    expect(resolveDefaultWeekStart("2026-09-10", BASE_SCHEDULE)).toBe("2026-09-07");
  });

  it("defaults to the final schedule week when today is after the schedule end", () => {
    expect(resolveDefaultWeekStart("2026-11-01", BASE_SCHEDULE)).toBe("2026-10-12");
  });

  it("normalizes week query values to Monday", () => {
    expect(parseWeekQueryParam("2026-08-26", "2026-08-24")).toBe("2026-08-24");
    expect(getMondayWeekStart("2026-08-26")).toBe("2026-08-24");
  });

  it("falls back safely for invalid week query values", () => {
    expect(parseWeekQueryParam("not-a-date", "2026-08-24")).toBe("2026-08-24");
    expect(parseWeekQueryParam(undefined, "2026-08-24")).toBe("2026-08-24");
  });

  it("detects whether a week intersects the schedule period", () => {
    expect(weekIntersectsSchedule("2026-08-24", "2026-08-30", BASE_SCHEDULE)).toBe(
      true,
    );
    expect(weekIntersectsSchedule("2026-08-10", "2026-08-16", BASE_SCHEDULE)).toBe(
      false,
    );
  });

  it("resolves selected schedule IDs from query params safely", () => {
    const schedules = [BASE_SCHEDULE];

    expect(
      resolveSelectedScheduleId(
        "00000000-0000-4000-8000-000000000000",
        schedules,
        BASE_SCHEDULE.id,
      ),
    ).toBe(BASE_SCHEDULE.id);

    expect(
      resolveSelectedScheduleId(undefined, schedules, BASE_SCHEDULE.id),
    ).toBe(BASE_SCHEDULE.id);
  });
});

describe("Aug 24–30 baseline week view model", () => {
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

  it("materializes the expected number of weekly occurrences from the 54-item template", () => {
    expect(occurrences).toHaveLength(54);
    expect(viewModel.blocks).toHaveLength(54);
  });

  it("includes Monday BAIS and SEES at the exact baseline times", () => {
    const mondayBais = viewModel.blocks.find(
      (block) => block.date === "2026-08-24" && block.title === "BAIS:2800",
    );
    const mondaySees = viewModel.blocks.find(
      (block) => block.date === "2026-08-24" && block.title === "SEES:1400",
    );

    expect(mondayBais?.timeLabel).toBe("2:30 PM – 3:20 PM");
    expect(mondaySees?.timeLabel).toBe("4:30 PM – 5:20 PM");
  });

  it("includes Wednesday BAIS and both SEES blocks", () => {
    const wednesdayTitles = viewModel.blocks
      .filter((block) => block.date === "2026-08-26")
      .map((block) => `${block.title}:${block.timeLabel}`);

    expect(wednesdayTitles).toContain("BAIS:2800:8:30 AM – 9:20 AM");
    expect(wednesdayTitles.filter((entry) => entry.startsWith("SEES:1400"))).toHaveLength(
      2,
    );
  });

  it("does not include a Sunday Reading block", () => {
    const sundayReading = viewModel.blocks.find(
      (block) => block.date === "2026-08-30" && block.title === "Reading",
    );

    expect(sundayReading).toBeUndefined();
  });

  it("represents open-ended Lights Out blocks in the view model", () => {
    const lightsOutBlocks = viewModel.blocks.filter((block) => block.title === "Lights Out");

    expect(lightsOutBlocks.length).toBeGreaterThan(0);
    expect(lightsOutBlocks.every((block) => block.isOpenEnded)).toBe(true);
    expect(lightsOutBlocks.every((block) => block.timeLabel.endsWith("→"))).toBe(
      true,
    );
  });

  it("positions Morning Routine at 6:30 AM proportionally", () => {
    const mondayMorning = viewModel.blocks.find(
      (block) => block.date === "2026-08-24" && block.title === "Morning Routine",
    );

    expect(mondayMorning?.topPx).toBe(26);
    expect(mondayMorning?.heightPx).toBeGreaterThan(70);
  });

  it("renders gym blocks taller than short class blocks", () => {
    const mondayGym = viewModel.blocks.find(
      (block) => block.date === "2026-08-24" && block.title === "Chest/Back",
    );
    const mondayBais = viewModel.blocks.find(
      (block) => block.date === "2026-08-24" && block.title === "BAIS:2800",
    );

    expect(mondayGym && mondayBais && mondayGym.heightPx > mondayBais.heightPx).toBe(
      true,
    );
  });
});

describe("open-ended block layout", () => {
  it("extends open-ended blocks to the bottom of the visible grid", () => {
    const layout = buildScheduleBlockLayout({
      startTime: "22:30:00",
      endTime: null,
      isOpenEnded: true,
    });

    expect(layout.topPx).toBeGreaterThan(800);
    expect(layout.heightPx).toBeGreaterThan(0);
  });
});

describe("schedule category styles", () => {
  it("maps categories to deterministic class names", () => {
    expect(getScheduleCategoryClassName("class")).toBe("schedule-block--class");
    expect(getScheduleCategoryClassName("gym")).toBe("schedule-block--gym");
    expect(getScheduleCategoryClassName("recovery")).toBe("schedule-block--gym");
    expect(sortCategoriesForLegend(["sleep", "class", "gym"])).toEqual([
      "class",
      "gym",
      "sleep",
    ]);
  });
});

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

describe("schedule nav icon", () => {
  it("registers a schedule icon in jarvis-nav-icons", () => {
    const icons = readFileSync("components/jarvis/jarvis-nav-icons.tsx", "utf8");

    expect(icons).toContain('"schedule"');
    expect(icons).toContain("schedule:");
  });
});
