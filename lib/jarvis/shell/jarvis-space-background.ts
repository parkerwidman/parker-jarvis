export type JarvisSpaceBackgroundProfile = {
  src: string;
  width: number;
  height: number;
  objectPosition: string;
  environment: "space";
};

export const JARVIS_SPACE_BACKGROUND_SRC = "/jarvis/jarvis-space-source.png";

export const JARVIS_SPACE_BACKGROUND: JarvisSpaceBackgroundProfile = {
  src: JARVIS_SPACE_BACKGROUND_SRC,
  width: 1672,
  height: 941,
  objectPosition: "52% 45%",
  environment: "space",
};

export function getJarvisSpaceBackgroundProfile(): JarvisSpaceBackgroundProfile {
  return JARVIS_SPACE_BACKGROUND;
}

/** @deprecated Use JARVIS_SPACE_BACKGROUND */
export const JARVIS_PLANET_SPACE_BACKGROUND = JARVIS_SPACE_BACKGROUND;

/** @deprecated Use JARVIS_SPACE_BACKGROUND_SRC */
export const JARVIS_SPACE_SOURCE_PATH = JARVIS_SPACE_BACKGROUND_SRC;
