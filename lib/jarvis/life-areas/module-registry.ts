export type LifeAreaModuleKey = "melusi" | "school" | "fitness" | "diet";

export type LifeAreaModuleAccent = "cyan" | "blue" | "green" | "amber";

export type LifeAreaModuleConfig = {
  key: LifeAreaModuleKey;
  displayName: string;
  lifeAreaName: string;
  route: string | null;
  purpose: string;
  accent: LifeAreaModuleAccent;
  implemented: boolean;
};

const LIFE_AREA_MODULES: LifeAreaModuleConfig[] = [
  {
    key: "melusi",
    displayName: "Melusi",
    lifeAreaName: "Melusi",
    route: "/melusi",
    purpose: "Parker's business command module.",
    accent: "cyan",
    implemented: true,
  },
  {
    key: "school",
    displayName: "School",
    lifeAreaName: "School",
    route: null,
    purpose: "Academic deadlines, classes, and study focus.",
    accent: "blue",
    implemented: false,
  },
  {
    key: "fitness",
    displayName: "Fitness",
    lifeAreaName: "Fitness",
    route: null,
    purpose: "Training sessions, recovery, and consistency.",
    accent: "green",
    implemented: false,
  },
  {
    key: "diet",
    displayName: "Diet",
    lifeAreaName: "Diet",
    route: null,
    purpose: "Nutrition habits and meal planning support.",
    accent: "amber",
    implemented: false,
  },
];

export function getLifeAreaModules(): readonly LifeAreaModuleConfig[] {
  return LIFE_AREA_MODULES;
}

export function getLifeAreaModule(
  key: LifeAreaModuleKey,
): LifeAreaModuleConfig {
  const module = LIFE_AREA_MODULES.find((entry) => entry.key === key);

  if (!module) {
    throw new Error(`Unknown life area module: ${key}`);
  }

  return module;
}

export function isLifeAreaModuleKey(value: string): value is LifeAreaModuleKey {
  return LIFE_AREA_MODULES.some((entry) => entry.key === value);
}
