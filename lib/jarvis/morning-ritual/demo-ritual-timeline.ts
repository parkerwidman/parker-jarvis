import type { RitualMode } from "@/lib/jarvis/morning-ritual/ring-geometry";

/** Demo-only transcript for Phase 4 visual inspection. Replaced in Phase 5. */
export const DEMO_RITUAL_TRANSCRIPT = [
  "Two things stand out today.",
  "On Melusi, 2 leads have been waiting over a day.",
  "Content posting is still 0 of 4 for the week.",
  "On personal, nothing's overdue — your next deadline is 6 days out.",
  "Suggest Melusi mode, starting with the leads.",
] as const;

export type DemoRitualSnapshot = {
  activeSentenceIndex: number;
  recommendedMode: RitualMode | null;
  modeRevealed: boolean;
  isPlaying: boolean;
  isFinished: boolean;
};

/** Phase 4 demo timeline — isolated for Phase 5 audio replacement. */
const DEMO_TIMELINE: Array<{
  atMs: number;
  snapshot: DemoRitualSnapshot;
}> = [
  {
    atMs: 0,
    snapshot: {
      activeSentenceIndex: 0,
      recommendedMode: null,
      modeRevealed: false,
      isPlaying: true,
      isFinished: false,
    },
  },
  {
    atMs: 5000,
    snapshot: {
      activeSentenceIndex: 1,
      recommendedMode: null,
      modeRevealed: false,
      isPlaying: true,
      isFinished: false,
    },
  },
  {
    atMs: 11000,
    snapshot: {
      activeSentenceIndex: 2,
      recommendedMode: null,
      modeRevealed: false,
      isPlaying: true,
      isFinished: false,
    },
  },
  {
    atMs: 16000,
    snapshot: {
      activeSentenceIndex: 3,
      recommendedMode: null,
      modeRevealed: false,
      isPlaying: true,
      isFinished: false,
    },
  },
  {
    atMs: 20000,
    snapshot: {
      activeSentenceIndex: 4,
      recommendedMode: "melusi",
      modeRevealed: true,
      isPlaying: true,
      isFinished: false,
    },
  },
  {
    atMs: 24000,
    snapshot: {
      activeSentenceIndex: 4,
      recommendedMode: "melusi",
      modeRevealed: true,
      isPlaying: false,
      isFinished: true,
    },
  },
];

export function getDemoRitualSnapshot(elapsedMs: number): DemoRitualSnapshot {
  let current = DEMO_TIMELINE[0].snapshot;

  for (const step of DEMO_TIMELINE) {
    if (elapsedMs >= step.atMs) {
      current = step.snapshot;
    }
  }

  return current;
}

export function formatRitualDate(ritualDate: string): string {
  const [year, month, day] = ritualDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}
