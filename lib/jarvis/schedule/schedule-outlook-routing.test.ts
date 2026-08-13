import { describe, expect, it } from "vitest";

import { BASE_MAIN_JARVIS_INSTRUCTIONS } from "@/lib/jarvis/agents/main-instructions-content";
import { MAIN_JARVIS_TOOLS } from "@/lib/jarvis/agents/tool-definitions";

function toolDescription(name: string): string {
  const tool = MAIN_JARVIS_TOOLS.find((entry) => entry.name === name);
  expect(tool).toBeDefined();
  return tool?.description ?? "";
}

const FAILED_PHRASE =
  "Add a D7.6 test block Tuesday August 25 from 1:00 to 1:30 PM.";

describe("Jarvis Schedule vs Outlook routing contract", () => {
  it("documents the failed manual-test phrase as Jarvis Schedule", () => {
    expect(BASE_MAIN_JARVIS_INSTRUCTIONS).toContain("D7.6 test block");
    expect(BASE_MAIN_JARVIS_INSTRUCTIONS).toContain("Jarvis Schedule vs Outlook Calendar");
    expect(BASE_MAIN_JARVIS_INSTRUCTIONS).toContain(
      'The noun "block" strongly favors Jarvis Schedule',
    );
  });

  it("steers block requests away from Outlook calendar creation", () => {
    expect(BASE_MAIN_JARVIS_INSTRUCTIONS).toContain(
      "Do NOT use create_outlook_calendar_event for personal Jarvis Schedule blocks",
    );
    expect(BASE_MAIN_JARVIS_INSTRUCTIONS).toContain(
      "Do not use create_outlook_calendar_event for these requests",
    );
    expect(toolDescription("create_outlook_calendar_event")).toContain(
      "Do NOT use for personal Jarvis Schedule blocks",
    );
    expect(toolDescription("propose_add_schedule_item")).toContain(
      "Do NOT use for Outlook calendar events",
    );
  });

  it("requires clarification for genuinely ambiguous requests", () => {
    expect(BASE_MAIN_JARVIS_INSTRUCTIONS).toContain(
      "Do you want that added to your Jarvis Schedule or your Outlook calendar?",
    );
    expect(BASE_MAIN_JARVIS_INSTRUCTIONS).toContain(
      "Do not silently choose Outlook merely because a date and time exist",
    );
    expect(BASE_MAIN_JARVIS_INSTRUCTIONS).toContain("Add something Tuesday at 3");
    expect(BASE_MAIN_JARVIS_INSTRUCTIONS).toContain("Schedule this for Friday");
  });

  it("preserves D7.6 proposal confirmation flow for Schedule mutations", () => {
    expect(BASE_MAIN_JARVIS_INSTRUCTIONS).toContain("propose_* Schedule tool");
    expect(BASE_MAIN_JARVIS_INSTRUCTIONS).toContain("confirm_pending_schedule_action");
    expect(BASE_MAIN_JARVIS_INSTRUCTIONS).toContain(
      "Never claim a Schedule change happened before confirm_pending_schedule_action succeeds",
    );
    expect(toolDescription("propose_add_schedule_item")).toContain(
      "does NOT mutate Schedule until Parker explicitly confirms",
    );
  });

  it("frames Outlook calendar writes as external commitments only", () => {
    const outlookDescription = toolDescription("create_outlook_calendar_event");

    expect(outlookDescription).toContain("meetings");
    expect(outlookDescription).toContain("appointments");
    expect(outlookDescription).toContain("invitations");
    expect(outlookDescription).not.toMatch(
      /schedule, add, create, or put an event on his Outlook calendar/i,
    );
  });
});

describe("Schedule routing examples in instructions", () => {
  const scheduleExamples = [
    "Add a work block Tuesday from 2 to 4.",
    "Add a focus block tomorrow at 3.",
    "Add a D7.6 test block Tuesday from 1 to 1:30.",
    "Move tomorrow's workout to 3:30.",
  ];

  it.each(scheduleExamples)("documents Schedule example: %s", (example) => {
    expect(BASE_MAIN_JARVIS_INSTRUCTIONS).toContain(example);
  });

  it("documents Schedule block semantics in propose_add_schedule_item", () => {
    const description = toolDescription("propose_add_schedule_item");

    expect(description).toMatch(/work blocks|focus blocks|study blocks|gym\/workout blocks/);
    expect(description).toMatch(/routines|reading|planning|recurring personal structure/);
  });

  it("documents move/remove/skip semantics in other Schedule proposal tools", () => {
    expect(toolDescription("propose_move_schedule_item")).toContain("personal time block");
    expect(toolDescription("propose_remove_schedule_item")).toContain("personal time blocks");
    expect(toolDescription("propose_skip_schedule_occurrence")).toContain("personal time block");
  });

  it("covers recurring reading and gym block routing via Schedule semantics", () => {
    expect(BASE_MAIN_JARVIS_INSTRUCTIONS).toMatch(/reading|workout|gym\/workout block/);
    expect(toolDescription("propose_add_schedule_item")).toContain("reading");
    expect(toolDescription("propose_move_schedule_item")).toMatch(/gym|workout/);
    expect(toolDescription("propose_remove_schedule_item")).toContain("work");
  });
});

describe("Outlook routing examples in instructions", () => {
  const outlookExamples = [
    "Put a dentist appointment on my calendar Tuesday at 1.",
    "Schedule a meeting with Alex Tuesday at 1.",
    "Add my interview to Outlook Friday at 2.",
    "Invite Sarah to a meeting Tuesday at 10.",
  ];

  it.each(outlookExamples)("documents Outlook example: %s", (example) => {
    expect(BASE_MAIN_JARVIS_INSTRUCTIONS).toContain(example);
  });

  it("documents external commitment keywords in Outlook instructions", () => {
    expect(BASE_MAIN_JARVIS_INSTRUCTIONS).toMatch(
      /meetings, appointments, interviews, reservations, flights, calls with other people, invitations/,
    );
  });

  it("covers calendar-event phrasing as Outlook routing", () => {
    expect(BASE_MAIN_JARVIS_INSTRUCTIONS).toMatch(/calendar event|Outlook calendar/);
    expect(toolDescription("create_outlook_calendar_event")).toMatch(/calendar event|Outlook calendar/);
  });
});

describe("exact failed phrase regression", () => {
  it("maps the failed phrase to propose_add_schedule_item semantics", () => {
    expect(FAILED_PHRASE.toLowerCase()).toContain("block");
    expect(BASE_MAIN_JARVIS_INSTRUCTIONS).toContain("D7.6 test block");
    expect(toolDescription("propose_add_schedule_item")).toMatch(
      /personal time block|one-off personal blocks/,
    );
    expect(toolDescription("create_outlook_calendar_event")).not.toMatch(/test block/i);
  });
});
