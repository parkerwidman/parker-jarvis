import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { computeTtsContentHash } from "@/lib/jarvis/audio/content-hash";
import { resolveMorningBriefTtsConfig } from "@/lib/jarvis/audio/tts-config";
import {
  buildMorningBriefModeRecommendationSentence,
  buildMorningBriefRecommendationMetadata,
  buildMorningBriefRecommendationReason,
  deriveMorningBriefRecommendationFromTranscript,
  ensureMorningBriefModeRecommendation,
  finalizeMorningBriefRecommendation,
  findRecommendationSentenceIndex,
  formatPriorityPhraseForRecommendationReason,
  isMorningBriefRecommendedMode,
  MORNING_BRIEF_RECOMMENDED_MODE_VALUES,
  parseMorningBriefRecommendedMode,
  resolveMorningBriefRecommendation,
  resolveMorningBriefRecommendationContextFromPriority,
  resolveMorningBriefRecommendedModeFromPriority,
  sanitizePriorityTitleForRecommendationReason,
  sentenceContainsExplicitModeRecommendation,
  type MorningBriefRecommendationContext,
} from "@/lib/jarvis/briefings/morning-brief-recommendation";
import { segmentMorningBriefSentences } from "@/lib/jarvis/briefings/segment-morning-brief-sentences";
import type {
  MorningBriefTask,
  MorningBriefTopPriority,
} from "@/lib/jarvis/briefings/morning-brief-structure";
import { countMorningBriefWords } from "@/lib/jarvis/briefings/morning-brief-structure";

const MIGRATION_PATH =
  "supabase/migrations/20260807060000_add_morning_brief_recommendation_metadata.sql";

function buildTask(overrides: Partial<MorningBriefTask> = {}): MorningBriefTask {
  return {
    id: "task-1",
    title: "Finish proposal",
    priority: "high",
    due_at: "2026-08-07T15:00:00.000Z",
    overdue: false,
    dueToday: true,
    dueSoon: true,
    ...overrides,
  };
}

function buildPriority(
  overrides: Partial<MorningBriefTopPriority> = {},
): MorningBriefTopPriority {
  return {
    phrase: "Finish proposal",
    reason: "It is marked high priority and due today.",
    source: "meaningful_deadline",
    dueDate: "2026-08-07",
    ...overrides,
  };
}

function buildRecommendationContext(
  overrides: Partial<MorningBriefRecommendationContext> = {},
): MorningBriefRecommendationContext {
  return {
    recommendedMode: "personal",
    reason: "your top priority is Finish proposal",
    ...overrides,
  };
}

function buildContextFromPriority(input: {
  topPriority: MorningBriefTopPriority;
  tasks: MorningBriefTask[];
  currentFocus?: string | null;
  melusiProjectTaskIds?: ReadonlySet<string>;
}): MorningBriefRecommendationContext | null {
  return resolveMorningBriefRecommendationContextFromPriority({
    topPriority: input.topPriority,
    tasks: input.tasks,
    currentFocus: input.currentFocus ?? null,
    melusiProjectTaskIds: input.melusiProjectTaskIds ?? new Set(),
  });
}

describe("MorningBriefRecommendedMode validation", () => {
  it("accepts personal and melusi only", () => {
    expect(MORNING_BRIEF_RECOMMENDED_MODE_VALUES).toEqual(["personal", "melusi"]);
    expect(isMorningBriefRecommendedMode("personal")).toBe(true);
    expect(isMorningBriefRecommendedMode("melusi")).toBe(true);
    expect(isMorningBriefRecommendedMode("Melusi")).toBe(false);
    expect(isMorningBriefRecommendedMode("")).toBe(false);
    expect(parseMorningBriefRecommendedMode("personal")).toBe("personal");
    expect(parseMorningBriefRecommendedMode("unknown")).toBeNull();
  });
});

describe("morning brief recommendation migration schema", () => {
  const migration = readFileSync(MIGRATION_PATH, "utf8");

  it("adds nullable recommendation columns with coherent-state constraints", () => {
    expect(migration).toContain("ADD COLUMN recommended_mode text");
    expect(migration).toContain("ADD COLUMN recommendation_sentence_index integer");
    expect(migration).toContain("morning_briefings_recommended_mode_values_check");
    expect(migration).toContain("'personal'::text, 'melusi'::text");
    expect(migration).toContain(
      "morning_briefings_recommendation_sentence_index_check",
    );
    expect(migration).toContain("recommendation_sentence_index >= 0");
    expect(migration).toContain(
      "morning_briefings_recommendation_metadata_state_check",
    );
    expect(migration).toContain("recommended_mode IS NULL");
    expect(migration).toContain("recommendation_sentence_index IS NULL");
    expect(migration).toContain("recommended_mode IS NOT NULL");
    expect(migration).toContain("recommendation_sentence_index IS NOT NULL");
  });

  it("does not store recommendation metadata in source_counts", () => {
    expect(migration).not.toContain("source_counts");
  });

  it("does not alter RLS or add client-facing policies", () => {
    expect(migration).not.toMatch(/DROP POLICY/i);
    expect(migration).not.toMatch(/CREATE POLICY/i);
    expect(migration).not.toMatch(/GRANT.*TO anon/i);
  });
});

describe("resolveMorningBriefRecommendedModeFromPriority", () => {
  it("uses structured Melusi life area from the main priority task", () => {
    const mode = resolveMorningBriefRecommendedModeFromPriority({
      topPriority: buildPriority({ phrase: "Post launch update" }),
      tasks: [
        buildTask({
          title: "Post launch update",
          lifeAreaName: "Melusi",
        }),
      ],
      currentFocus: null,
      melusiProjectTaskIds: new Set(),
    });

    expect(mode).toBe("melusi");
  });

  it("uses structured Personal life area from the main priority task", () => {
    const mode = resolveMorningBriefRecommendedModeFromPriority({
      topPriority: buildPriority({ phrase: "Renew passport" }),
      tasks: [
        buildTask({
          title: "Renew passport",
          lifeAreaName: "Personal",
        }),
      ],
      currentFocus: null,
      melusiProjectTaskIds: new Set(),
    });

    expect(mode).toBe("personal");
  });

  it("uses Melusi project membership when life area is missing", () => {
    const mode = resolveMorningBriefRecommendedModeFromPriority({
      topPriority: buildPriority({ phrase: "Ship landing page" }),
      tasks: [
        buildTask({
          id: "melusi-task",
          title: "Ship landing page",
          lifeAreaName: null,
          projectId: "project-1",
        }),
      ],
      currentFocus: null,
      melusiProjectTaskIds: new Set(["project-1"]),
    });

    expect(mode).toBe("melusi");
  });

  it("returns null only when no source task can be resolved", () => {
    expect(
      resolveMorningBriefRecommendedModeFromPriority({
        topPriority: buildPriority({
          phrase: "Write blog post",
          source: "profile_focus",
        }),
        tasks: [],
        currentFocus: "Write blog post",
        melusiProjectTaskIds: new Set(),
      }),
    ).toBeNull();

    expect(
      resolveMorningBriefRecommendedModeFromPriority({
        topPriority: null,
        tasks: [buildTask({ lifeAreaName: "Melusi" })],
        currentFocus: null,
        melusiProjectTaskIds: new Set(),
      }),
    ).toBeNull();
  });

  it("returns personal for a normal untagged task with no Melusi marker", () => {
    expect(
      resolveMorningBriefRecommendedModeFromPriority({
        topPriority: buildPriority({ phrase: "Untagged task" }),
        tasks: [
          buildTask({
            title: "Untagged task",
            lifeAreaName: null,
            projectId: null,
          }),
        ],
        currentFocus: null,
        melusiProjectTaskIds: new Set(),
      }),
    ).toBe("personal");
  });

  it("returns personal for the Aug 8 retroactive withdrawal priority without life area metadata", () => {
    expect(
      resolveMorningBriefRecommendedModeFromPriority({
        topPriority: buildPriority({
          phrase: "Figure out retroactive withdrawal for last semester's classes",
        }),
        tasks: [
          buildTask({
            title: "Figure out retroactive withdrawal for last semester's classes",
            lifeAreaName: null,
            projectId: null,
          }),
        ],
        currentFocus: "Figure out retroactive withdrawal for last semester's classes",
        melusiProjectTaskIds: new Set(),
      }),
    ).toBe("personal");
  });

  it("does not classify a generic business-sounding task as Melusi without structured association", () => {
    expect(
      resolveMorningBriefRecommendedModeFromPriority({
        topPriority: buildPriority({ phrase: "Review Q3 marketing plan" }),
        tasks: [
          buildTask({
            title: "Review Q3 marketing plan",
            lifeAreaName: null,
            projectId: null,
          }),
        ],
        currentFocus: null,
        melusiProjectTaskIds: new Set(),
      }),
    ).toBe("personal");
  });
});

describe("resolveMorningBriefRecommendationContextFromPriority", () => {
  it("returns Melusi mode with reason grounded in the selected top priority", () => {
    const context = buildContextFromPriority({
      topPriority: buildPriority({ phrase: "Review Melusi business plan" }),
      tasks: [
        buildTask({
          title: "Review Melusi business plan",
          lifeAreaName: "Melusi",
        }),
      ],
    });

    expect(context).toEqual({
      recommendedMode: "melusi",
      reason: "your top priority is Review Melusi business plan",
    });
  });

  it("returns Personal mode with reason grounded in the selected top priority", () => {
    const context = buildContextFromPriority({
      topPriority: buildPriority({
        phrase: "Figure out retroactive withdrawal for last semester's classes",
      }),
      tasks: [
        buildTask({
          title: "Figure out retroactive withdrawal for last semester's classes",
          lifeAreaName: "Personal",
        }),
      ],
    });

    expect(context).toEqual({
      recommendedMode: "personal",
      reason:
        "your top priority is Figure out retroactive withdrawal for last semester's classes",
    });
  });

  it("does not use an unrelated task as the recommendation reason", () => {
    const context = buildContextFromPriority({
      topPriority: buildPriority({ phrase: "Renew passport" }),
      tasks: [
        buildTask({
          title: "Renew passport",
          lifeAreaName: "Personal",
        }),
        buildTask({
          id: "other-task",
          title: "Review Melusi business plan",
          lifeAreaName: "Melusi",
        }),
      ],
    });

    expect(context?.reason).toBe("your top priority is Renew passport");
    expect(context?.reason).not.toContain("Melusi business plan");
  });

  it("derives mode and reason from the same resolved source task title", () => {
    const context = buildContextFromPriority({
      topPriority: buildPriority({
        phrase: "  review melusi business plan  ",
      }),
      tasks: [
        buildTask({
          title: "Review Melusi business plan",
          lifeAreaName: "Melusi",
        }),
      ],
    });

    expect(context).toEqual({
      recommendedMode: "melusi",
      reason: "your top priority is Review Melusi business plan",
    });
  });

  it("returns Personal mode for an untagged general task with resolved source task", () => {
    expect(
      buildContextFromPriority({
        topPriority: buildPriority({ phrase: "Untagged task" }),
        tasks: [
          buildTask({
            title: "Untagged task",
            lifeAreaName: null,
            projectId: null,
          }),
        ],
      }),
    ).toEqual({
      recommendedMode: "personal",
      reason: "your top priority is Untagged task",
    });
  });

  it("returns null when no source task can be resolved", () => {
    expect(
      buildContextFromPriority({
        topPriority: buildPriority({
          phrase: "Missing task",
          source: "profile_focus",
        }),
        tasks: [],
        currentFocus: "Missing task",
      }),
    ).toBeNull();

    expect(
      buildContextFromPriority({
        topPriority: null,
        tasks: [buildTask({ lifeAreaName: "Personal" })],
      }),
    ).toBeNull();
  });
});

describe("priority title sanitization for recommendation reasons", () => {
  it("preserves imperative task titles without lowercasing or adding to", () => {
    expect(
      buildMorningBriefRecommendationReason(
        "Figure out retroactive withdrawal for last semester's classes",
      ),
    ).toBe(
      "your top priority is Figure out retroactive withdrawal for last semester's classes",
    );
  });

  it("preserves proper nouns and acronyms in task titles", () => {
    expect(buildMorningBriefRecommendationReason("Review Melusi business plan")).toBe(
      "your top priority is Review Melusi business plan",
    );
    expect(buildMorningBriefRecommendationReason("IRS paperwork")).toBe(
      "your top priority is IRS paperwork",
    );
    expect(buildMorningBriefRecommendationReason("Q3 marketing plan")).toBe(
      "your top priority is Q3 marketing plan",
    );
    expect(buildMorningBriefRecommendationReason("AI training rollout")).toBe(
      "your top priority is AI training rollout",
    );
    expect(buildMorningBriefRecommendationReason("Melusi business plan")).toBe(
      "your top priority is Melusi business plan",
    );
  });

  it("does not produce to to when the title already begins with To", () => {
    expect(
      buildMorningBriefRecommendationReason("To review Melusi business plan"),
    ).toBe("your top priority is To review Melusi business plan");
    expect(
      buildMorningBriefRecommendationReason("To review Melusi business plan"),
    ).not.toContain("to to");
  });

  it("strips trailing punctuation and normalizes whitespace", () => {
    expect(sanitizePriorityTitleForRecommendationReason("IRS paperwork.")).toBe(
      "IRS paperwork",
    );
    expect(
      sanitizePriorityTitleForRecommendationReason("  Q3   marketing   plan  "),
    ).toBe("Q3 marketing plan");
    expect(formatPriorityPhraseForRecommendationReason("Review Melusi plan.")).toBe(
      "Review Melusi plan",
    );
  });

  it("returns empty for blank titles and truncates long titles at word boundaries", () => {
    expect(sanitizePriorityTitleForRecommendationReason("   ")).toBe("");
    expect(buildMorningBriefRecommendationReason("   ")).toBe("");

    const longTitle = `${"word ".repeat(40).trim()} extra tail words`;
    const sanitized = sanitizePriorityTitleForRecommendationReason(longTitle);

    expect(sanitized.length).toBeLessThanOrEqual(120);
    expect(sanitized).not.toContain("extra tail");
    expect(longTitle.startsWith(sanitized)).toBe(true);
  });
});

describe("spoken recommendation sentence production", () => {
  const baseBrief =
    "Good morning, Parker. Your top priority is finishing the proposal before the investor sync.";
  const personalContext = buildRecommendationContext({
    recommendedMode: "personal",
    reason: "your top priority is Finish the proposal before the investor sync",
  });
  const melusiContext = buildRecommendationContext({
    recommendedMode: "melusi",
    reason: "your top priority is Post launch update",
  });

  function countExplicitRecommendations(content: string): {
    personal: number;
    melusi: number;
  } {
    const sentences = segmentMorningBriefSentences(content);

    return sentences.reduce(
      (counts, sentence) => ({
        personal:
          counts.personal +
          (sentenceContainsExplicitModeRecommendation(sentence, "personal")
            ? 1
            : 0),
        melusi:
          counts.melusi +
          (sentenceContainsExplicitModeRecommendation(sentence, "melusi") ? 1 : 0),
      }),
      { personal: 0, melusi: 0 },
    );
  }

  it("appends a concise reasoned recommendation when mode is known", () => {
    const content = ensureMorningBriefModeRecommendation(baseBrief, melusiContext);

    expect(content).toContain("I suggest Melusi mode today because");
    expect(content).toContain("your top priority is Post launch update");
    expect(content.endsWith(
      "I suggest Melusi mode today because your top priority is Post launch update.",
    )).toBe(true);
    expect(countMorningBriefWords(content) - countMorningBriefWords(baseBrief)).toBeLessThanOrEqual(
      16,
    );
    expect(countExplicitRecommendations(content)).toEqual({ personal: 0, melusi: 1 });
  });

  it("normalizes an existing generic same-mode recommendation into the reasoned form", () => {
    const withRecommendation = `${baseBrief} I'd run Melusi mode this morning.`;
    const content = ensureMorningBriefModeRecommendation(withRecommendation, melusiContext);

    expect(content).toBe(
      `${baseBrief} I suggest Melusi mode today because your top priority is Post launch update.`,
    );
    expect(countExplicitRecommendations(content)).toEqual({ personal: 0, melusi: 1 });
  });

  it("replaces an opposite explicit recommendation with the structured target reasoned form", () => {
    const withPersonal = `${baseBrief} Personal mode makes the most sense this morning.`;
    const content = ensureMorningBriefModeRecommendation(withPersonal, melusiContext);

    expect(content).toBe(
      `${baseBrief} I suggest Melusi mode today because your top priority is Post launch update.`,
    );
    expect(countExplicitRecommendations(content)).toEqual({ personal: 0, melusi: 1 });
  });

  it("replaces structured Personal target over an existing Melusi recommendation", () => {
    const withMelusi = `${baseBrief} I'd run Melusi mode this morning.`;
    const content = ensureMorningBriefModeRecommendation(withMelusi, personalContext);

    expect(content).toBe(
      `${baseBrief} I suggest Personal mode today because your top priority is Finish the proposal before the investor sync.`,
    );
    expect(countExplicitRecommendations(content)).toEqual({ personal: 1, melusi: 0 });
  });

  it("collapses duplicate same-mode recommendations to one reasoned sentence", () => {
    const withDuplicates = `${baseBrief} I'd run Melusi mode this morning. I suggest Melusi mode today because your top priority is Post launch update.`;
    const content = ensureMorningBriefModeRecommendation(withDuplicates, melusiContext);

    expect(content).toBe(
      `${baseBrief} I suggest Melusi mode today because your top priority is Post launch update.`,
    );
    expect(countExplicitRecommendations(content)).toEqual({ personal: 0, melusi: 1 });
  });

  it("normalizes mixed Personal and Melusi recommendations to one target reasoned recommendation", () => {
    const withMixed = `${baseBrief} Personal mode makes the most sense this morning. I'd run Melusi mode this morning.`;
    const content = ensureMorningBriefModeRecommendation(withMixed, melusiContext);

    expect(content).toBe(
      `${baseBrief} I suggest Melusi mode today because your top priority is Post launch update.`,
    );
    expect(countExplicitRecommendations(content)).toEqual({ personal: 0, melusi: 1 });
  });

  it("preserves unrelated brief sentences while normalizing recommendations", () => {
    const withContext = `${baseBrief} On Melusi, 2 leads have been waiting over a day. Personal mode makes the most sense this morning.`;
    const content = ensureMorningBriefModeRecommendation(withContext, melusiContext);

    expect(content).toBe(
      `${baseBrief} On Melusi, 2 leads have been waiting over a day. I suggest Melusi mode today because your top priority is Post launch update.`,
    );
    expect(content).toContain("On Melusi, 2 leads have been waiting over a day.");
    expect(countExplicitRecommendations(content)).toEqual({ personal: 0, melusi: 1 });
  });

  it("derives recommendation sentence index from final canonical sentences", () => {
    const { content, metadata } = finalizeMorningBriefRecommendation({
      content: baseBrief,
      recommendationContext: personalContext,
    });
    const sentences = segmentMorningBriefSentences(content);

    expect(metadata).toEqual({
      recommendedMode: "personal",
      recommendationSentenceIndex: sentences.length - 1,
    });
    expect(
      sentenceContainsExplicitModeRecommendation(
        sentences[metadata!.recommendationSentenceIndex],
        "personal",
      ),
    ).toBe(true);
    expect(countExplicitRecommendations(content)).toEqual({ personal: 1, melusi: 0 });
  });

  it("points recommendationSentenceIndex at the exact final reasoned sentence after conflict resolution", () => {
    const withPersonal = `${baseBrief} Personal mode makes the most sense this morning.`;
    const { content, metadata } = finalizeMorningBriefRecommendation({
      content: withPersonal,
      recommendationContext: melusiContext,
    });
    const sentences = segmentMorningBriefSentences(content);

    expect(metadata).toEqual({
      recommendedMode: "melusi",
      recommendationSentenceIndex: sentences.length - 1,
    });
    expect(sentences[metadata!.recommendationSentenceIndex]).toBe(
      "I suggest Melusi mode today because your top priority is Post launch update.",
    );
  });

  it("returns no recommendation when context is null", () => {
    const { content, metadata } = finalizeMorningBriefRecommendation({
      content: baseBrief,
      recommendationContext: null,
    });

    expect(content).toBe(baseBrief);
    expect(metadata).toBeNull();
  });
});

describe("deriveMorningBriefRecommendationFromTranscript", () => {
  it("derives Personal and Melusi recommendations conservatively from explicit phrases", () => {
    const personalContent =
      "Good morning, Parker. Nothing urgent needs attention today. I suggest Personal mode today because your top priority is Renew passport.";

    expect(deriveMorningBriefRecommendationFromTranscript(personalContent)).toEqual({
      recommendedMode: "personal",
      recommendationSentenceIndex: 2,
    });

    const melusiContent =
      "Two things stand out today. On Melusi, 2 leads have been waiting over a day. I suggest Melusi mode today because your top priority is Review the Melusi business plan.";

    expect(deriveMorningBriefRecommendationFromTranscript(melusiContent)).toEqual({
      recommendedMode: "melusi",
      recommendationSentenceIndex: 2,
    });
  });

  it("returns null for generic mentions, ambiguity, or missing recommendations", () => {
    expect(
      deriveMorningBriefRecommendationFromTranscript(
        "On Melusi, 2 leads have been waiting over a day.",
      ),
    ).toBeNull();

    expect(
      deriveMorningBriefRecommendationFromTranscript(
        "On personal, nothing's overdue. Your next deadline is 6 days out.",
      ),
    ).toBeNull();

    expect(
      deriveMorningBriefRecommendationFromTranscript(
        "I suggest Personal mode today because your top priority is Renew passport. I suggest Melusi mode today because your top priority is Review the Melusi business plan.",
      ),
    ).toBeNull();

    expect(
      deriveMorningBriefRecommendationFromTranscript(
        "Good morning, Parker. Nothing urgent needs attention today.",
      ),
    ).toBeNull();
  });
});

describe("resolveMorningBriefRecommendation", () => {
  const content =
    "Good morning, Parker. Your top priority is finishing the proposal. I suggest Melusi mode today because your top priority is Finish the proposal.";
  const transcriptDerived = {
    recommendedMode: "melusi" as const,
    recommendationSentenceIndex: 2,
  };

  it("allows transcript fallback when both persisted fields are absent", () => {
    expect(
      resolveMorningBriefRecommendation({
        content,
        persistedRecommendedMode: null,
        persistedRecommendationSentenceIndex: null,
      }),
    ).toEqual(transcriptDerived);
  });

  it("uses valid persisted metadata when the indexed sentence matches", () => {
    expect(
      resolveMorningBriefRecommendation({
        content,
        persistedRecommendedMode: "melusi",
        persistedRecommendationSentenceIndex: 2,
      }),
    ).toEqual(transcriptDerived);
  });

  it("returns null for partial persisted metadata instead of transcript fallback", () => {
    expect(
      resolveMorningBriefRecommendation({
        content,
        persistedRecommendedMode: "melusi",
        persistedRecommendationSentenceIndex: null,
      }),
    ).toBeNull();

    expect(
      resolveMorningBriefRecommendation({
        content,
        persistedRecommendedMode: null,
        persistedRecommendationSentenceIndex: 2,
      }),
    ).toBeNull();
  });

  it("returns null for invalid persisted mode values", () => {
    expect(
      resolveMorningBriefRecommendation({
        content,
        persistedRecommendedMode: "Melusi",
        persistedRecommendationSentenceIndex: 2,
      }),
    ).toBeNull();
  });

  it("returns null for negative or non-integer persisted indexes", () => {
    expect(
      resolveMorningBriefRecommendation({
        content,
        persistedRecommendedMode: "melusi",
        persistedRecommendationSentenceIndex: -1,
      }),
    ).toBeNull();

    expect(
      resolveMorningBriefRecommendation({
        content,
        persistedRecommendedMode: "melusi",
        persistedRecommendationSentenceIndex: 2.5,
      }),
    ).toBeNull();
  });

  it("returns null for out-of-range persisted indexes", () => {
    expect(
      resolveMorningBriefRecommendation({
        content,
        persistedRecommendedMode: "melusi",
        persistedRecommendationSentenceIndex: 99,
      }),
    ).toBeNull();
  });

  it("returns null for persisted mode and sentence mismatches", () => {
    expect(
      resolveMorningBriefRecommendation({
        content,
        persistedRecommendedMode: "personal",
        persistedRecommendationSentenceIndex: 2,
      }),
    ).toBeNull();
  });

  it("never derives a different transcript sentence when persisted metadata is malformed", () => {
    const malformedCases = [
      {
        persistedRecommendedMode: "melusi",
        persistedRecommendationSentenceIndex: 99,
      },
      {
        persistedRecommendedMode: "personal",
        persistedRecommendationSentenceIndex: 2,
      },
      {
        persistedRecommendedMode: "melusi",
        persistedRecommendationSentenceIndex: null,
      },
      {
        persistedRecommendedMode: null,
        persistedRecommendationSentenceIndex: 2,
      },
      {
        persistedRecommendedMode: "Melusi",
        persistedRecommendationSentenceIndex: 2,
      },
      {
        persistedRecommendedMode: "melusi",
        persistedRecommendationSentenceIndex: -1,
      },
    ] as const;

    for (const persisted of malformedCases) {
      expect(
        resolveMorningBriefRecommendation({
          content,
          ...persisted,
        }),
      ).toBeNull();
    }
  });

  it("returns null safely when neither persisted metadata nor transcript derivation works", () => {
    expect(
      resolveMorningBriefRecommendation({
        content: "Good morning, Parker. Nothing urgent needs attention today.",
        persistedRecommendedMode: "melusi",
        persistedRecommendationSentenceIndex: 1,
      }),
    ).toBeNull();
  });
});

describe("audio timeline and TTS hash interaction", () => {
  it("does not mutate timeline fields when recommendation metadata is resolved", () => {
    const timelineRow = {
      audio_timeline: {
        version: 1,
        sentences: [
          { index: 0, text: "Good morning, Parker.", startMs: 0, endMs: 1200 },
          {
            index: 1,
            text: "On Melusi, 2 leads have been waiting over a day.",
            startMs: 1200,
            endMs: 4800,
          },
        ],
      },
      audio_timeline_content_hash: "abc123",
      audio_duration_ms: 4800,
    };

    const resolved = resolveMorningBriefRecommendation({
      content:
        "Good morning, Parker. On Melusi, 2 leads have been waiting over a day.",
      persistedRecommendedMode: null,
      persistedRecommendationSentenceIndex: null,
    });

    expect(resolved).toBeNull();
    expect(timelineRow).toEqual({
      audio_timeline: {
        version: 1,
        sentences: [
          { index: 0, text: "Good morning, Parker.", startMs: 0, endMs: 1200 },
          {
            index: 1,
            text: "On Melusi, 2 leads have been waiting over a day.",
            startMs: 1200,
            endMs: 4800,
          },
        ],
      },
      audio_timeline_content_hash: "abc123",
      audio_duration_ms: 4800,
    });
  });

  it("changes TTS hash naturally when spoken content gains a recommendation sentence", () => {
    const ttsConfig = resolveMorningBriefTtsConfig();
    const baseBrief =
      "Good morning, Parker. Your top priority is finishing the proposal before the investor sync.";
    const context = buildRecommendationContext({
      recommendedMode: "melusi",
      reason: "your top priority is Finish the proposal before the investor sync",
    });
    const withRecommendation = ensureMorningBriefModeRecommendation(
      baseBrief,
      context,
    );

    const baseHash = computeTtsContentHash({
      text: baseBrief,
      model: ttsConfig.model,
      voice: ttsConfig.voice,
      format: ttsConfig.format,
      instructionVersion: ttsConfig.instructionVersion,
    });
    const recommendationHash = computeTtsContentHash({
      text: withRecommendation,
      model: ttsConfig.model,
      voice: ttsConfig.voice,
      format: ttsConfig.format,
      instructionVersion: ttsConfig.instructionVersion,
    });

    expect(recommendationHash).not.toBe(baseHash);
    expect(buildMorningBriefRecommendationMetadata(withRecommendation, context)).toEqual({
      recommendedMode: "melusi",
      recommendationSentenceIndex: findRecommendationSentenceIndex(
        withRecommendation,
        "melusi",
      ),
    });
  });
});

describe("recommendation sentence builders", () => {
  it("uses I suggest phrasing with exact Personal and Melusi terminology and structured reason", () => {
    expect(
      buildMorningBriefModeRecommendationSentence({
        recommendedMode: "melusi",
        reason: "your top priority is Review the Melusi business plan",
      }),
    ).toBe(
      "I suggest Melusi mode today because your top priority is Review the Melusi business plan.",
    );
    expect(
      buildMorningBriefModeRecommendationSentence({
        recommendedMode: "personal",
        reason:
          "your top priority is Figure out retroactive withdrawal for last semester's classes",
      }),
    ).toBe(
      "I suggest Personal mode today because your top priority is Figure out retroactive withdrawal for last semester's classes.",
    );
  });
});
