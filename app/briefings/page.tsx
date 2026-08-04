import { JarvisAppShell } from "@/components/jarvis/jarvis-app-shell";
import { JarvisPageHeader } from "@/components/jarvis/jarvis-page-header";
import {
  JarvisAlert,
  JarvisButton,
  JarvisCard,
  JarvisEmptyState,
  JarvisMarkdownContent,
  JarvisPageContent,
  JarvisSection,
  statusBadgeClass,
} from "@/components/jarvis/jarvis-ui";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { generateMorningBriefAction } from "./actions";

type MorningBriefingRow = {
  id: string;
  briefing_date: string;
  timezone: string;
  status: string;
  content: string | null;
  safe_error_message: string | null;
  generated_at: string | null;
};

function formatBriefingDate(dateString: string): string {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));

  return date.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

function formatGeneratedAt(isoString: string, timeZone: string): string {
  const date = new Date(isoString);

  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
    timeZoneName: "short",
  });
}

function getLocalDateString(timeZone: string, now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function briefingStatusLabel(status: string | undefined): string {
  switch (status) {
    case "completed":
      return "Ready";
    case "generating":
      return "Generating";
    case "failed":
      return "Failed";
    default:
      return "Not generated";
  }
}

export default async function BriefingsPage() {
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getClaims();

  if (authError || !authData?.claims) {
    redirect("/login");
  }

  const userId =
    typeof authData.claims.sub === "string" ? authData.claims.sub : null;

  if (!userId) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("jarvis_profiles")
    .select("timezone")
    .maybeSingle();

  const displayTimeZone = profile?.timezone?.trim() || "America/Chicago";
  const todayDate = getLocalDateString(displayTimeZone);

  const { data: briefings } = await supabase
    .from("morning_briefings")
    .select(
      "id, briefing_date, timezone, status, content, safe_error_message, generated_at",
    )
    .eq("user_id", userId)
    .order("briefing_date", { ascending: false })
    .limit(14);

  const rows = (briefings ?? []) as MorningBriefingRow[];
  const todayBriefing = rows.find((row) => row.briefing_date === todayDate);
  const mostRecentCompleted = rows.find((row) => row.status === "completed");
  const historyRows = rows.filter(
    (row) =>
      row.briefing_date !== mostRecentCompleted?.briefing_date &&
      row.status === "completed",
  );

  const hasTodayBriefing = todayBriefing !== undefined;

  return (
    <JarvisAppShell>
      <JarvisPageContent className="jv-page-content--scroll">
        <JarvisPageHeader
          title="Morning Brief"
          subtitle="Your schedule, priorities, email, tasks, and goals in one place."
        />

        <div className="jv-action-row">
          <form action={generateMorningBriefAction} className="jv-action-form">
            <JarvisButton type="submit" className="jv-btn--block">
              {hasTodayBriefing
                ? "Regenerate today's brief"
                : "Generate morning brief"}
            </JarvisButton>
          </form>
          {todayBriefing ? (
            <span className={statusBadgeClass(todayBriefing.status)}>
              {briefingStatusLabel(todayBriefing.status)}
            </span>
          ) : null}
        </div>

        {todayBriefing?.status === "generating" ? (
          <JarvisCard accent="blue">
            <p className="jv-status-message">Generating today&apos;s brief…</p>
            <p className="jv-status-detail">
              Jarvis is gathering your schedule, email, tasks, and goals.
            </p>
          </JarvisCard>
        ) : null}

        {todayBriefing?.status === "failed" ? (
          <JarvisAlert variant="error">
            {todayBriefing.safe_error_message ??
              "Jarvis could not generate the morning brief."}
          </JarvisAlert>
        ) : null}

        {mostRecentCompleted?.content ? (
          <JarvisCard title="Current brief" accent="blue" scroll>
            <div className="jv-meta-row">
              <span>{formatBriefingDate(mostRecentCompleted.briefing_date)}</span>
              {mostRecentCompleted.generated_at ? (
                <span>
                  Generated{" "}
                  {formatGeneratedAt(
                    mostRecentCompleted.generated_at,
                    mostRecentCompleted.timezone,
                  )}
                </span>
              ) : null}
              <span>Timezone: {mostRecentCompleted.timezone}</span>
            </div>
            <JarvisMarkdownContent content={mostRecentCompleted.content} />
          </JarvisCard>
        ) : todayBriefing?.status !== "generating" ? (
          <JarvisEmptyState
            title="No brief yet"
            description="Generate your first morning brief to see your day at a glance."
          />
        ) : null}

        {historyRows.length > 0 ? (
          <JarvisSection title="Earlier briefs">
            <ul className="jv-history-list">
              {historyRows.map((row) => (
                <li key={row.id} className="jv-history-item">
                  {formatBriefingDate(row.briefing_date)}
                  {row.generated_at ? (
                    <span className="jv-history-meta">
                      · {formatGeneratedAt(row.generated_at, row.timezone)}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </JarvisSection>
        ) : null}
      </JarvisPageContent>
    </JarvisAppShell>
  );
}
