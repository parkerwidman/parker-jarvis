import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  ACTION_TYPE_CREATE_OUTLOOK_CALENDAR_EVENT,
  ACTION_TYPE_CREATE_OUTLOOK_DRAFT,
  ACTION_TYPE_CREATE_OUTLOOK_REMINDER,
  ACTION_TYPE_CREATE_TASK,
  ACTION_TYPE_SEND_OUTLOOK_EMAIL,
  AUTO_EXECUTED_ACTION_TYPES,
  DEPLOYED_ACTION_REQUEST_TYPES,
} from "@/lib/jarvis/action-requests/action-type-constants";

const AUTO_EXECUTE_MIGRATION =
  "supabase/migrations/20260806140000_add_auto_execute_action_support.sql";
const TASK_MIGRATION =
  "supabase/migrations/20260806130000_add_task_creation_action_request.sql";
const DRAFT_MIGRATION =
  "supabase/migrations/20260806150000_add_outlook_draft_action_type.sql";

function readMigration(path: string): string {
  return readFileSync(path, "utf8");
}

function extractActionTypesFromMigration(migration: string): string[] {
  const match = migration.match(
    /action_type = ANY\s*\(\s*ARRAY\[([\s\S]*?)\]\s*\)/,
  );
  if (!match) {
    throw new Error("Could not parse action_type constraint from migration");
  }

  return [...match[1].matchAll(/'([^']+)'::text/g)].map((entry) => entry[1]);
}

describe("action_requests action_type SQL constraints", () => {
  it("accepts every currently deployed action type constant", () => {
    const migrationTypes = extractActionTypesFromMigration(readMigration(DRAFT_MIGRATION));

    for (const actionType of DEPLOYED_ACTION_REQUEST_TYPES) {
      expect(migrationTypes).toContain(actionType);
    }
  });

  it("accepts create_outlook_draft in the latest migration", () => {
    const migrationTypes = extractActionTypesFromMigration(readMigration(DRAFT_MIGRATION));
    expect(migrationTypes).toContain(ACTION_TYPE_CREATE_OUTLOOK_DRAFT);
  });

  it("preserves historical create_task and calendar approval action types", () => {
    const draftTypes = extractActionTypesFromMigration(readMigration(DRAFT_MIGRATION));
    const taskTypes = extractActionTypesFromMigration(readMigration(TASK_MIGRATION));

    expect(draftTypes).toContain(ACTION_TYPE_CREATE_TASK);
    expect(draftTypes).toContain(ACTION_TYPE_CREATE_OUTLOOK_CALENDAR_EVENT);
    expect(draftTypes).toContain("update_outlook_calendar_event");
    expect(draftTypes).toContain("delete_outlook_calendar_event");

    for (const actionType of taskTypes) {
      expect(draftTypes).toContain(actionType);
    }
  });

  it("preserves reminder, calendar, task, email-send, and other auto-execute types", () => {
    const autoExecuteTypes = extractActionTypesFromMigration(
      readMigration(AUTO_EXECUTE_MIGRATION),
    );
    const draftTypes = extractActionTypesFromMigration(readMigration(DRAFT_MIGRATION));

    for (const actionType of autoExecuteTypes) {
      expect(draftTypes).toContain(actionType);
    }

    for (const actionType of AUTO_EXECUTED_ACTION_TYPES) {
      expect(draftTypes).toContain(actionType);
    }

    expect(draftTypes).toContain(ACTION_TYPE_SEND_OUTLOOK_EMAIL);
    expect(draftTypes).toContain(ACTION_TYPE_CREATE_OUTLOOK_REMINDER);
  });
});
