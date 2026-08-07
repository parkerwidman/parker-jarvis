export const BRIEFING_WAVEFORM_BAR_COUNT = 60;

export function buildBriefingWaveformBarHeights(
  barCount = BRIEFING_WAVEFORM_BAR_COUNT,
): number[] {
  return Array.from({ length: barCount }, (_, index) => {
    const wave = Math.sin(index * 0.35) * 0.5 + 0.5;
    return Math.round(6 + wave * 28);
  });
}
