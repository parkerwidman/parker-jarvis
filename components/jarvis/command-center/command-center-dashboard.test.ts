import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}));

vi.mock("@/app/command-center/actions", () => ({
  completeTaskFromDashboard: vi.fn(),
}));

import { CommandCenterDashboard } from "./command-center-dashboard";
import { ModeSwitcher } from "./mode-switcher";
import { CommandCenterModeProvider } from "./command-center-mode-provider";

const DASHBOARD_PATH = resolve(
  import.meta.dirname,
  "command-center-dashboard.tsx",
);
const MODE_SWITCHER_PATH = resolve(import.meta.dirname, "mode-switcher.tsx");
const BRIEFING_PLAYER_PATH = resolve(
  import.meta.dirname,
  "briefing-player.tsx",
);
const ASK_JARVIS_PATH = resolve(import.meta.dirname, "ask-jarvis-bar.tsx");
const LOAD_COMMAND_CENTER_PATH = resolve(
  import.meta.dirname,
  "../../../lib/jarvis/dashboard/load-command-center.ts",
);
const MORNING_RITUAL_BRIEFING_PATH = resolve(
  import.meta.dirname,
  "../../../lib/jarvis/rituals/morning-ritual-briefing.ts",
);
const AUDIO_ROUTE_PATH = resolve(
  import.meta.dirname,
  "../../../app/api/briefings/audio/route.ts",
);
const WAKE_PAGE_PATH = resolve(import.meta.dirname, "../../../app/wake/page.tsx");

const SAMPLE_DATA = {
  preferredName: "Parker",
  timezone: "America/Chicago",
  todayDate: "2026-08-07",
  todayDateLabel: "Friday, August 7, 2026",
  headerStatus: "3 tasks due today",
  briefing: {
    id: "briefing-id",
    briefingDate: "2026-08-07",
    status: "completed",
    preview: "Good morning.",
    safeErrorMessage: null,
    audioStatus: "ready" as const,
    audioGeneratedAt: "2026-08-07T08:00:00.000Z",
  },
  plan: null,
  focusTask: {
    id: "task-1",
    title: "Reply to leads",
    priority: "high",
    dueAt: null,
    overdue: false,
    dueToday: true,
    lifeAreaName: "Melusi",
    selectionReason: "Highest impact",
    nextAction: null,
  },
  taskGroups: {
    next: [],
    later: [],
    additionalOverdueCount: 0,
    completedTodayCount: 0,
    dueTodayTotal: 0,
  },
  schedule: { connected: false, items: [], emptyMessage: null },
  goals: [],
  goalItems: [
    {
      id: "goal-1",
      title: "Launch Melusi",
      progress: 40,
      lifeAreaName: "Melusi",
      progressLabel: "40% complete",
    },
  ],
  attentionItems: [],
  approvals: [],
  outlook: { connected: false, needsReconnect: false, events: [] },
  inbox: {
    connected: false,
    needsReconnect: false,
    messages: [],
    unreadCount: 0,
    emptyMessage: "Outlook is not connected.",
  },
  kanbanTasks: [
    {
      id: "task-1",
      title: "Reply to leads",
      status: "todo",
      lifeAreaName: "Melusi",
    },
  ],
  melusiLifeAreaIds: [],
  counts: {
    unfinishedTasks: 1,
    overdueTasks: 0,
    pendingApprovals: 0,
    activeGoals: 1,
  },
};

function renderDashboard() {
  return renderToStaticMarkup(
    createElement(CommandCenterDashboard, {
      data: SAMPLE_DATA,
      displayName: "Parker",
      greeting: "Good morning",
    }),
  );
}

describe("CommandCenterDashboard morning brief removal", () => {
  it("does not import or render BriefingPlayer", () => {
    const source = readFileSync(DASHBOARD_PATH, "utf8");

    expect(source).not.toContain("BriefingPlayer");
    expect(source).not.toContain("briefingTranscript");
    expect(source).not.toContain("briefingPriorityText");
  });

  it("does not render briefing audio controls or transcript UI", () => {
    const html = renderDashboard();

    expect(html).not.toContain("Morning briefing player");
    expect(html).not.toContain("Your briefing");
    expect(html).not.toContain("cc2-play-btn");
    expect(html).not.toContain("cc2-listen-card");
    expect(html).not.toContain("Show transcript");
    expect(html).not.toContain("Hide transcript");
    expect(html).not.toContain("<audio");
  });

  it("keeps greeting and date at the top", () => {
    const html = renderDashboard();

    expect(html).toContain("Good morning, Parker");
    expect(html).toContain("Friday, August 7, 2026");
    expect(html.indexOf("cc2-greeting")).toBeLessThan(
      html.indexOf("cc2-priority-strip"),
    );
  });

  it("places the mode switcher in the header before priority", () => {
    const html = renderDashboard();
    const headerEnd = html.indexOf("</header>");
    const modeSegStart = html.indexOf("cc2-mode-seg");
    const priorityStart = html.indexOf("cc2-priority-strip");

    expect(headerEnd).toBeGreaterThan(-1);
    expect(modeSegStart).toBeGreaterThan(-1);
    expect(modeSegStart).toBeLessThan(headerEnd);
    expect(priorityStart).toBeGreaterThan(headerEnd);
    expect(html).not.toContain("cc2-listen-card");
  });

  it("preserves the compact Personal/Melusi segmented mode toggle", () => {
    const html = renderDashboard();
    const modeSwitcherSource = readFileSync(MODE_SWITCHER_PATH, "utf8");

    expect(html).toContain("cc2-mode-seg");
    expect(html).toContain("Personal");
    expect(html).toContain("Melusi");
    expect(html).not.toContain("Suggested:");
    expect(html).not.toContain("Switch to personal");
    expect(html).not.toContain("Go to Melusi");
    expect(modeSwitcherSource).toContain('setMode("personal")');
    expect(modeSwitcherSource).toContain('setMode("melusi")');
    expect(modeSwitcherSource).toContain("useCommandCenterMode");
  });

  it("preserves board, goals, inbox, and calendar sections", () => {
    const html = renderDashboard();

    expect(html).toContain("cc2-kanban");
    expect(html).toContain("Goal progress");
    expect(html).toContain("Coming at you");
    expect(html).toContain("Outlook inbox");
    expect(html).toContain("Today&#x27;s calendar");
  });

  it("keeps Ask Jarvis available independently via /api/assistant wiring", () => {
    const dashboardSource = readFileSync(DASHBOARD_PATH, "utf8");
    const askSource = readFileSync(ASK_JARVIS_PATH, "utf8");
    const html = renderDashboard();

    expect(dashboardSource).toContain('fetch("/api/assistant"');
    expect(dashboardSource).toContain("AskJarvisBar");
    expect(askSource).toContain("Ask Jarvis");
    expect(html).toContain('placeholder="Ask Jarvis…"');
    expect(html).toContain("What&#x27;s overdue?");
    expect(html).toContain("What can wait?");
    expect(html).toContain("How&#x27;s Melusi trending?");
    expect(html).toContain("What&#x27;s my week look like?");
    expect(html).not.toContain("briefingDate");
  });

  it("does not remove Morning Ritual briefing infrastructure", () => {
    const ritualSource = readFileSync(MORNING_RITUAL_BRIEFING_PATH, "utf8");
    const audioRouteSource = readFileSync(AUDIO_ROUTE_PATH, "utf8");
    const wakeSource = readFileSync(WAKE_PAGE_PATH, "utf8");
    const briefingPlayerSource = readFileSync(BRIEFING_PLAYER_PATH, "utf8");

    expect(ritualSource).toContain("morning_briefings");
    expect(audioRouteSource).toContain("signed");
    expect(wakeSource).not.toContain("BriefingPlayer");
    expect(briefingPlayerSource).toContain("BriefingPlayer");
    expect(briefingPlayerSource).not.toContain('from "./mode-switcher"');
  });

  it("leaves briefing transcript fields out of the Command Center loader", () => {
    const loaderSource = readFileSync(LOAD_COMMAND_CENTER_PATH, "utf8");

    expect(loaderSource).not.toContain("briefingTranscript");
    expect(loaderSource).not.toContain("briefingPriorityText");
    expect(loaderSource).toContain("morning_briefings");
  });
});

describe("ModeSwitcher", () => {
  it("renders the compact segmented Personal/Melusi toggle", () => {
    const html = renderToStaticMarkup(
      createElement(
        CommandCenterModeProvider,
        null,
        createElement(ModeSwitcher),
      ),
    );

    expect(html).toContain('class="cc2-mode-seg"');
    expect(html).toContain("Personal");
    expect(html).toContain("Melusi");
    expect(html).not.toContain("Suggested:");
    expect(html).not.toContain("Switch to personal");
    expect(html).not.toContain("Go to Melusi");
  });
});
