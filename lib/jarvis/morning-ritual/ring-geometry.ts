export const RING_CENTER = 150;
export const OUTER_BAR_COUNT = 60;
export const INNER_BAR_COUNT = 40;
export const TICK_COUNT = 24;
export const OUTER_BAR_RADIUS = 62;
export const INNER_BAR_RADIUS = 46;

export const RING_COLORS = {
  neutral: "#c7cbd6",
  melusi: "#3B7DDD",
  personal: "#F0A93B",
} as const;

export type RitualMode = "personal" | "melusi";

export type RadialBar = {
  index: number;
  angle: number;
  baselineLength: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

export type TickMark = {
  index: number;
  isMajor: boolean;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

function hashSeed(seed: string): number {
  let hash = 2166136261;

  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

export function createSeededRandom(seed: string) {
  let state = hashSeed(seed) || 1;

  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function polarToCartesian(
  center: number,
  radius: number,
  angleRadians: number,
): { x: number; y: number } {
  return {
    x: center + radius * Math.cos(angleRadians),
    y: center + radius * Math.sin(angleRadians),
  };
}

function createRadialBar(
  index: number,
  count: number,
  innerRadius: number,
  baselineLength: number,
  center: number,
): RadialBar {
  const angle = (index / count) * Math.PI * 2 - Math.PI / 2;
  const start = polarToCartesian(center, innerRadius, angle);
  const end = polarToCartesian(center, innerRadius + baselineLength, angle);

  return {
    index,
    angle,
    baselineLength,
    x1: start.x,
    y1: start.y,
    x2: end.x,
    y2: end.y,
  };
}

export function generateOuterBars(seed = "morning-ritual-outer-bars-v1"): RadialBar[] {
  const random = createSeededRandom(seed);

  return Array.from({ length: OUTER_BAR_COUNT }, (_, index) => {
    const baselineLength = 8 + random() * 10;
    return createRadialBar(
      index,
      OUTER_BAR_COUNT,
      OUTER_BAR_RADIUS,
      baselineLength,
      RING_CENTER,
    );
  });
}

export function generateInnerBars(seed = "morning-ritual-inner-bars-v1"): RadialBar[] {
  const random = createSeededRandom(seed);

  return Array.from({ length: INNER_BAR_COUNT }, (_, index) => {
    const baselineLength = 4 + random() * 6;
    return createRadialBar(
      index,
      INNER_BAR_COUNT,
      INNER_BAR_RADIUS,
      baselineLength,
      RING_CENTER,
    );
  });
}

export function generateTicks(): TickMark[] {
  return Array.from({ length: TICK_COUNT }, (_, index) => {
    const isMajor = index % 4 === 0;
    const angle = (index / TICK_COUNT) * Math.PI * 2 - Math.PI / 2;
    const innerRadius = isMajor ? 110 : 114;
    const outerRadius = 118;
    const start = polarToCartesian(RING_CENTER, innerRadius, angle);
    const end = polarToCartesian(RING_CENTER, outerRadius, angle);

    return {
      index,
      isMajor,
      x1: start.x,
      y1: start.y,
      x2: end.x,
      y2: end.y,
    };
  });
}

export function getRingColor(
  recommendedMode: RitualMode | null,
  modeRevealed: boolean,
): string {
  if (!modeRevealed || !recommendedMode) {
    return RING_COLORS.neutral;
  }

  return RING_COLORS[recommendedMode];
}

export function getModeAccentBorder(recommendedMode: RitualMode | null): string {
  if (recommendedMode === "personal") {
    return "rgba(240, 169, 59, 0.35)";
  }

  return "rgba(59, 125, 221, 0.35)";
}

export function computeJitteredLength(
  baselineLength: number,
  barIndex: number,
  frame: number,
  minLength: number,
  maxLength: number,
): number {
  const seed = createSeededRandom(`jitter-${barIndex}-${Math.floor(frame / 8)}`);
  const roll = seed();
  const target = minLength + roll * (maxLength - minLength);
  const blend = 0.35 + ((frame + barIndex * 3) % 10) / 20;
  return baselineLength + (target - baselineLength) * blend;
}

export const OUTER_BARS = generateOuterBars();
export const INNER_BARS = generateInnerBars();
export const RING_TICKS = generateTicks();
