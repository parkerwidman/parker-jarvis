import type OpenAI from "openai";

import {
  getToolsForMainDomains,
  MAIN_TOOL_DOMAIN_ORDER,
  type MainToolDomain,
} from "@/lib/jarvis/agents/tool-domains";
import type { JarvisContextTarget } from "@/lib/jarvis/context/types";
import type { PendingScheduleActionRecord } from "@/lib/jarvis/schedule/pending-schedule-action-types";
import type { ScheduleConfirmationIntent } from "@/lib/jarvis/schedule/schedule-confirmation-intent";

export type DynamicToolExposureInput = {
  message: string;
  confirmationIntent: ScheduleConfirmationIntent;
  pendingAction: PendingScheduleActionRecord | null;
  contextTarget: JarvisContextTarget | null;
};

export type DynamicToolExposureResult = {
  domains: MainToolDomain[];
  tools: OpenAI.Responses.Tool[];
  routingReason: string;
};

const PLANNING_FALLBACK_DOMAINS: MainToolDomain[] = [
  "schedule_read",
  "tasks",
  "outlook_calendar",
];

const SCHEDULE_WRITE_DOMAINS: MainToolDomain[] = ["schedule_read", "schedule_write"];

function normalizeMessage(message: string): string {
  return message.trim().toLowerCase().replace(/\s+/g, " ");
}

function includesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

export function isPureGeneralKnowledgeRequest(message: string): boolean {
  const normalized = normalizeMessage(message);

  if (!normalized) {
    return false;
  }

  const personalDataCues = [
    /\bmy\b/,
    /\bi have\b/,
    /\bschedule\b/,
    /\bcalendar\b/,
    /\boutlook\b/,
    /\bemail\b/,
    /\bemails\b/,
    /\binbox\b/,
    /\btask\b/,
    /\btasks\b/,
    /\bgoal\b/,
    /\bgoals\b/,
    /\bproject\b/,
    /\bprojects\b/,
    /\bfinance\b/,
    /\bspend(?:ing)?\b/,
    /\bspent\b/,
    /\bhow much\b/,
    /\bmelusi\b/,
    /\bworkout\b/,
    /\broutine\b/,
    /\btomorrow\b/,
    /\btoday\b/,
    /\bthis week\b/,
    /\bplan my\b/,
    /\bprioriti(?:y|ze)\b/,
    /\bbriefing\b/,
    /\bremind me\b/,
    /\bdraft\b/,
    /\bmeeting\b/,
    /\bappointment\b/,
  ];

  if (includesAny(normalized, personalDataCues)) {
    return false;
  }

  const actionCues = [
    /\b(create|add|move|complete|cancel|confirm|send|update|delete|remove|reschedule|skip)\b/,
  ];

  if (includesAny(normalized, actionCues)) {
    return false;
  }

  return true;
}

export function detectRequestedMainToolDomains(
  message: string,
  contextTarget: JarvisContextTarget | null,
): Set<MainToolDomain> {
  const normalized = normalizeMessage(message);
  const domains = new Set<MainToolDomain>();

  if (
    includesAny(normalized, [
      /\btasks?\b/,
      /\btodo\b/,
      /\bto-do\b/,
      /\bfinish\b/,
      /\bcomplete task\b/,
      /\boverdue\b/,
    ])
  ) {
    domains.add("tasks");
  }

  if (
    includesAny(normalized, [
      /\bprojects?\b/,
      /\bblockers?\b/,
      /\bproject updates?\b/,
      /\bprogress update\b/,
    ])
  ) {
    domains.add("projects");
  }

  if (
    includesAny(normalized, [
      /\bremember\b/,
      /\bsave memory\b/,
      /\bcreate a goal\b/,
      /\btrack a goal\b/,
      /\bprofile\b/,
    ])
  ) {
    domains.add("memory");
  }

  if (
    includesAny(normalized, [
      /\binbox\b/,
      /\bemails?\b/,
      /\bunread\b/,
      /\bdraft\b/,
      /\bsend (?:an )?email\b/,
      /\breply\b/,
    ])
  ) {
    domains.add("outlook_inbox");
  }

  if (
    includesAny(normalized, [
      /\boutlook calendar\b/,
      /\boutlook\b/,
      /\bcalendar events?\b/,
      /\bmeeting\b/,
      /\bappointment\b/,
      /\binterview\b/,
      /\binvite\b/,
      /\battendees?\b/,
    ])
  ) {
    domains.add("outlook_calendar");
  }

  if (
    includesAny(normalized, [
      /\bspend(?:ing)?\b/,
      /\bspent\b/,
      /\bfinance\b/,
      /\bplaid\b/,
      /\brecurring charges?\b/,
      /\bbudget\b/,
      /\btransactions?\b/,
    ])
  ) {
    domains.add("personal_finance");
  }

  if (
    includesAny(normalized, [
      /\bmelusi expenses?\b/,
      /\brocket money\b/,
      /\bbusiness spending\b/,
      /\bowner-funded\b/,
    ])
  ) {
    domains.add("melusi_expenses");
  }

  const scheduleReadCues = [
    /\bschedule\b/,
    /\bjarvis schedule\b/,
    /\bwork block\b/,
    /\bfocus block\b/,
    /\bgym block\b/,
    /\bworkout\b/,
    /\bgym\b/,
    /\broutine\b/,
    /\bopen windows?\b/,
    /\bfree time\b/,
    /\bmy day\b/,
    /\bwhat(?:'s| is) on\b/,
    /\bclasses\b/,
    /\bperiods\b/,
  ];

  const scheduleWriteCues = [
    /\bmove\b/,
    /\badd\b/,
    /\bremove\b/,
    /\bskip\b/,
    /\breschedule\b/,
    /\bchange (?:my|the|tomorrow)/,
    /\bupdate (?:my|the|tomorrow)/,
  ];

  if (includesAny(normalized, scheduleReadCues)) {
    domains.add("schedule_read");
  }

  if (includesAny(normalized, scheduleWriteCues)) {
    domains.add("schedule_read");
    domains.add("schedule_write");
  }

  if (
    includesAny(normalized, [/\btomorrow\b/, /\btoday\b/, /\bthis week\b/]) &&
    includesAny(normalized, [/\bday\b/, /\blook like\b/, /\bfocus\b/, /\bplan\b/])
  ) {
    domains.add("schedule_read");
  }

  if (contextTarget?.type === "melusi_project") {
    domains.add("projects");
    domains.add("tasks");
  }

  return domains;
}

export function isAmbiguousPlanningRequest(message: string): boolean {
  const normalized = normalizeMessage(message);

  return includesAny(normalized, [
    /\bwhat should i focus on\b/,
    /\bwhat should i prioritize\b/,
    /\bwhat should i work on\b/,
    /\bwhat matters most\b/,
    /\bhelp me plan\b/,
    /\bplan my (?:day|week|tomorrow)\b/,
    /\bwhat do i need to do\b/,
  ]);
}

export function resolveMainJarvisToolExposure(
  input: DynamicToolExposureInput,
): DynamicToolExposureResult {
  const requestedDomains = detectRequestedMainToolDomains(
    input.message,
    input.contextTarget,
  );

  if (
    input.pendingAction &&
    (input.confirmationIntent === "confirm" ||
      input.confirmationIntent === "cancel" ||
      input.confirmationIntent === "revise")
  ) {
    return finalizeExposure(SCHEDULE_WRITE_DOMAINS, "pending_schedule_confirmation");
  }

  if (input.pendingAction && requestedDomains.has("schedule_write")) {
    return finalizeExposure(
      [...new Set<MainToolDomain>([...requestedDomains, "schedule_write"])],
      "pending_schedule_revision_or_write",
    );
  }

  if (isPureGeneralKnowledgeRequest(input.message)) {
    return finalizeExposure([], "general_knowledge");
  }

  if (isAmbiguousPlanningRequest(input.message)) {
    return finalizeExposure(PLANNING_FALLBACK_DOMAINS, "planning_fallback");
  }

  if (requestedDomains.size > 0) {
    const domains = [...requestedDomains];

    if (domains.includes("schedule_write") && !domains.includes("schedule_read")) {
      domains.push("schedule_read");
    }

    if (
      domains.includes("outlook_inbox") &&
      includesAny(normalizeMessage(input.message), [/\bdraft\b/, /\bsend\b/])
    ) {
      // inbox domain already includes draft/send tools
    }

    return finalizeExposure(domains, "explicit_domain_match");
  }

  if (input.pendingAction) {
    return finalizeExposure([], "pending_action_unrelated_turn");
  }

  return finalizeExposure([], "no_relevant_domains");
}

function finalizeExposure(
  domains: readonly MainToolDomain[],
  routingReason: string,
): DynamicToolExposureResult {
  const uniqueDomains = [...new Set(domains)];
  const orderedDomains = MAIN_TOOL_DOMAIN_ORDER.filter((domain) =>
    uniqueDomains.includes(domain),
  );

  return {
    domains: orderedDomains,
    tools: getToolsForMainDomains(orderedDomains),
    routingReason,
  };
}
