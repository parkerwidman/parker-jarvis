"use client";

import { JarvisButton } from "@/components/jarvis/jarvis-ui";
import { useFormStatus } from "react-dom";

type GenerateBriefButtonProps = {
  hasTodayBriefing: boolean;
};

export function GenerateBriefButton({
  hasTodayBriefing,
}: GenerateBriefButtonProps) {
  const { pending } = useFormStatus();

  return (
    <JarvisButton
      type="submit"
      className="jv-btn--block"
      disabled={pending}
      aria-busy={pending}
    >
      {pending
        ? "Generating…"
        : hasTodayBriefing
          ? "Regenerate today's brief"
          : "Generate morning brief"}
    </JarvisButton>
  );
}
