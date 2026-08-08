export type RitualStar = {
  id: number;
  top: number;
  left: number;
  size: number;
  delay: number;
  duration: number;
};

function hashSeed(seed: string): number {
  let hash = 2166136261;

  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function createSeededRandom(seed: string) {
  let state = hashSeed(seed) || 1;

  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateRitualStars(seed: string, count: number): RitualStar[] {
  const random = createSeededRandom(seed);

  return Array.from({ length: count }, (_, id) => {
    const sizeRoll = random();
    const size = sizeRoll < 0.18 ? 2 : 1;

    return {
      id,
      top: random() * 100,
      left: random() * 100,
      size,
      delay: random() * 4,
      duration: 2 + random() * 3,
    };
  });
}

export const SLEEP_STARFIELD = generateRitualStars("morning-ritual-sleep-v1", 55);
export const WELCOME_STARFIELD = generateRitualStars(
  "morning-ritual-welcome-v1",
  45,
);
