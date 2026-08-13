import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { CommandKanban } from "./command-kanban";
import { InboxPulse } from "./inbox-pulse";
import { CalendarPulse } from "./calendar-pulse";
import { CommandCenterModeProvider } from "./command-center-mode-provider";

vi.mock("@/app/command-center/actions", () => ({
  completeTaskFromDashboard: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

const TASK_ID = "11111111-1111-4111-8111-111111111111";

function renderKanban(
  tasks: Parameters<typeof CommandKanban>[0]["tasks"],
): string {
  return renderToStaticMarkup(
    createElement(
      CommandCenterModeProvider,
      { initialWorkspace: "melusi" },
      createElement(CommandKanban, { tasks }),
    ),
  );
}

function columnBlocks(html: string): string[] {
  return [...html.matchAll(/<div class="cc2-kcol">([\s\S]*?)<\/div>\s*<\/div>/g)].map(
    (match) => match[1],
  );
}

describe("Command Center compact panels", () => {
  describe("CommandKanban", () => {
    it("renders three column scroll regions with headers outside scroll areas", () => {
      const html = renderKanban([
        {
          id: TASK_ID,
          title: "Reply to leads",
          status: "todo",
          priority: "high",
          lifeAreaName: "Melusi",
          goalContext: null,
          completedToday: false,
        },
        {
          id: "22222222-2222-4222-8222-222222222222",
          title: "Ship feature",
          status: "in_progress",
          priority: "medium",
          lifeAreaName: "Melusi",
          goalContext: null,
          completedToday: false,
        },
        {
          id: "33333333-3333-4333-8333-333333333333",
          title: "Done task",
          status: "done",
          priority: "low",
          lifeAreaName: "Melusi",
          goalContext: null,
          completedToday: true,
        },
      ]);

      expect(html.match(/cc2-kcol-scroll/g)?.length).toBe(3);
      expect(html).toContain('aria-label="To do tasks"');
      expect(html).toContain('aria-label="In progress tasks"');
      expect(html).toContain('aria-label="Done tasks"');
      expect(html).toContain('aria-label="Mark &quot;Reply to leads&quot; as done"');
      expect(html).toContain('name="taskId"');
      expect(html).toContain(`value="${TASK_ID}"`);

      for (const column of columnBlocks(html)) {
        expect(column.indexOf("cc2-kcol-head")).toBeLessThan(
          column.indexOf("cc2-kcol-scroll"),
        );
      }
    });

    it("shows empty states inside scroll regions with real counts", () => {
      const html = renderKanban([]);

      expect(html.match(/No tasks/g)?.length).toBe(2);
      expect(html).toContain("Nothing in progress");
      expect(html.match(/cc2-kcol-scroll/g)?.length).toBe(3);
      expect(html.match(/cc2-kcol-count">0/g)?.length).toBe(3);
    });
  });

  describe("InboxPulse", () => {
    it("keeps the header outside the scroll region and labels the message list", () => {
      const html = renderToStaticMarkup(
        createElement(InboxPulse, {
          inbox: {
            connected: true,
            needsReconnect: false,
            unreadCount: 2,
            emptyMessage: null,
            messages: [
              {
                senderDisplay: "Alex Rivera",
                subject: "Quarterly review notes",
                isRead: false,
                receivedAt: "2026-08-06T14:30:00.000Z",
              },
              {
                senderDisplay: "Team Calendar",
                subject: "Standup moved to 10am",
                isRead: true,
                receivedAt: "2026-08-06T13:00:00.000Z",
              },
            ],
          },
          timeZone: "America/Chicago",
        }),
      );

      expect(html).toContain("Outlook inbox");
      expect(html).toContain("2 unread");
      expect(html).toContain('aria-label="Outlook inbox messages"');
      expect(html).toContain("Alex Rivera");
      expect(html).toContain("Quarterly review notes");
      expect(html.indexOf("cc2-pulse-head")).toBeLessThan(
        html.indexOf("cc2-pulse-scroll"),
      );
    });

    it("preserves disconnected empty states inside the scroll region", () => {
      const html = renderToStaticMarkup(
        createElement(InboxPulse, {
          inbox: {
            connected: false,
            needsReconnect: false,
            unreadCount: 0,
            emptyMessage:
              "Outlook is not connected. Connect Microsoft to see your inbox.",
            messages: [],
          },
          timeZone: "America/Chicago",
        }),
      );

      expect(html).toContain(
        "Outlook is not connected. Connect Microsoft to see your inbox.",
      );
      expect(html).toContain('aria-label="Outlook inbox messages"');
      expect(html).not.toMatch(/graph\.microsoft/i);
    });
  });

  describe("CalendarPulse", () => {
    it("keeps the header outside the scroll region and labels the event list", () => {
      const html = renderToStaticMarkup(
        createElement(CalendarPulse, {
          connected: true,
          needsReconnect: false,
          timeZone: "America/Chicago",
          todayDate: "2026-08-06",
          events: [
            {
              id: "event-1",
              subject: "Investor sync",
              start: "2026-08-06T15:00:00.000Z",
              end: "2026-08-06T16:00:00.000Z",
              localStart: "2026-08-06T10:00:00",
              localEnd: "2026-08-06T11:00:00",
              isAllDay: false,
              locationName: "Zoom",
            },
          ],
        }),
      );

      expect(html).toContain("Today&#x27;s calendar");
      expect(html).toContain('aria-label="Today&#x27;s calendar events"');
      expect(html).toContain("Investor sync");
      expect(html.indexOf("cc2-pulse-head")).toBeLessThan(
        html.indexOf("cc2-pulse-scroll"),
      );
    });

    it("preserves reconnect and empty states inside the scroll region", () => {
      const disconnected = renderToStaticMarkup(
        createElement(CalendarPulse, {
          connected: false,
          needsReconnect: false,
          timeZone: "America/Chicago",
          todayDate: "2026-08-06",
          events: [],
        }),
      );

      expect(disconnected).toContain(
        "Outlook is not connected. Connect Microsoft to see your calendar.",
      );

      const empty = renderToStaticMarkup(
        createElement(CalendarPulse, {
          connected: true,
          needsReconnect: false,
          timeZone: "America/Chicago",
          todayDate: "2026-08-06",
          events: [],
        }),
      );

      expect(empty).toContain("No events scheduled today.");
    });
  });
});
