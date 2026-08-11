export type FitnessConnectionSnapshot = {
  status: string;
  connected: boolean;
  lastSuccessfulSyncAt: string | null;
  syncInProgress: boolean;
};

export type FitnessRecoveryDisplayState =
  | "scored"
  | "pending"
  | "unscorable"
  | "none";

export type FitnessRecoverySnapshot = {
  displayState: FitnessRecoveryDisplayState;
  scoreState: string | null;
  score: number | null;
  statusLabel: "Strong" | "Moderate" | "Low" | null;
  statusLevel: "strong" | "moderate" | "low" | null;
  hrvMilli: number | null;
  restingHeartRate: number | null;
  spo2: number | null;
  skinTempCelsius: number | null;
};

export type FitnessSleepSnapshot = {
  displayState: "scored" | "pending" | "unscorable" | "none";
  scoreState: string | null;
  performancePct: number | null;
  totalSleepMs: number | null;
  totalSleepLabel: string | null;
  efficiencyPct: number | null;
  consistencyPct: number | null;
  respiratoryRate: number | null;
  sleepNeedBaselineMs: number | null;
  isNap: boolean;
};

export type FitnessCycleSnapshot = {
  displayState: "scored" | "pending" | "unscorable" | "none";
  scoreState: string | null;
  strain: number | null;
  averageHeartRate: number | null;
  maxHeartRate: number | null;
  kilojoule: number | null;
  kilocalories: number | null;
  isCurrent: boolean;
};

export type FitnessWorkoutSnapshot = {
  sportName: string;
  startAt: string;
  startTimeLabel: string;
  durationLabel: string | null;
  strain: number | null;
  averageHeartRate: number | null;
  maxHeartRate: number | null;
  scoreState: string | null;
};

export type FitnessBodySnapshot = {
  weightKilograms: number | null;
  weightPounds: number | null;
  maxHeartRate: number | null;
};

export type FitnessTodaySnapshot = {
  timeZone: string;
  todayDate: string;
  todayLabel: string;
  connection: FitnessConnectionSnapshot;
  recovery: FitnessRecoverySnapshot | null;
  sleep: FitnessSleepSnapshot | null;
  cycle: FitnessCycleSnapshot | null;
  workouts: FitnessWorkoutSnapshot[];
  body: FitnessBodySnapshot | null;
  syncFreshnessLabel: string;
  lastSyncedLabel: string | null;
};
