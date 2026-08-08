import type { MorningRitualEntry } from "@/lib/jarvis/rituals/load-morning-ritual-entry";

type MorningRitualGateProps = {
  entry: MorningRitualEntry;
};

export function MorningRitualGate({ entry }: MorningRitualGateProps) {
  if (entry.ritualState === "welcome_back") {
    return (
      <main
        data-testid="morning-ritual-gate"
        data-ritual-state={entry.ritualState}
        data-ritual-status={entry.ritualStatus}
        style={{
          alignItems: "center",
          display: "flex",
          justifyContent: "center",
          minHeight: "100vh",
        }}
      >
        <div>
          <h1>Welcome back, {entry.displayName}</h1>
          <p>Morning Ritual completed for {entry.ritualDate}.</p>
        </div>
      </main>
    );
  }

  return (
    <main
      data-testid="morning-ritual-gate"
      data-ritual-state={entry.ritualState}
      data-ritual-status={entry.ritualStatus}
      style={{
        alignItems: "center",
        display: "flex",
        justifyContent: "center",
        minHeight: "100vh",
      }}
    >
      <div>
        <h1>Good morning, {entry.displayName}</h1>
        <p>Morning Ritual ready for {entry.ritualDate}.</p>
      </div>
    </main>
  );
}
