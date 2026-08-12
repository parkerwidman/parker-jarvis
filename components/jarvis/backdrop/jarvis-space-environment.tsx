import {
  JARVIS_SPACE_BACKGROUND,
  JARVIS_SPACE_BACKGROUND_SRC,
  getJarvisSpaceBackgroundProfile,
} from "@/lib/jarvis/shell/jarvis-space-background";

import styles from "./jarvis-space-environment.module.css";

export function JarvisSpaceEnvironment() {
  const background = getJarvisSpaceBackgroundProfile();

  return (
    <div
      className={styles.root}
      aria-hidden="true"
      data-jarvis-space-environment
      data-environment={background.environment}
      data-background-src={JARVIS_SPACE_BACKGROUND_SRC}
      style={
        {
          "--jarvis-space-object-position": background.objectPosition,
        } as React.CSSProperties
      }
    >
      <img
        className={styles.image}
        src={JARVIS_SPACE_BACKGROUND_SRC}
        alt=""
        width={background.width}
        height={background.height}
        decoding="sync"
        fetchPriority="high"
      />
      <div className={styles.veil} />
    </div>
  );
}
