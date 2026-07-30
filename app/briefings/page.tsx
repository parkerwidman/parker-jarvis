import Link from "next/link";
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

function BriefingContent({ content }: { content: string }) {
  const lines = content.split("\n");

  return (
    <div className="flex flex-col gap-2 text-sm leading-relaxed text-[var(--foreground)]">
      {lines.map((line, index) => {
        const trimmed = line.trim();

        if (trimmed.startsWith("# ")) {
          return (
            <h2
              key={index}
              className="mt-2 text-lg font-semibold text-[var(--foreground)] first:mt-0"
            >
              {trimmed.slice(2)}
            </h2>
          );
        }

        if (trimmed.startsWith("## ")) {
          return (
            <h3
              key={index}
              className="mt-4 text-base font-medium text-[var(--foreground)]"
            >
              {trimmed.slice(3)}
            </h3>
          );
        }

        if (trimmed.startsWith("### ")) {
          return (
            <h4
              key={index}
              className="mt-3 text-sm font-medium text-[var(--foreground)]"
            >
              {trimmed.slice(4)}
            </h4>
          );
        }

        if (trimmed.length === 0) {
          return <div key={index} className="h-2" aria-hidden="true" />;
        }

        return (
          <p key={index} className="whitespace-pre-wrap text-[var(--foreground)]">
            {line}
          </p>
        );
      })}
    </div>
  );
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
    <div className="home">
      <main className="home-main">
        <header className="home-header">
          <h1 className="home-title">Morning Brief</h1>
          <p className="home-subtitle">
            Your schedule, priorities, email, tasks, and goals in one place.
          </p>
        </header>

        <form action={generateMorningBriefAction} className="w-full">
          <button
            type="submit"
            className="w-full rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            {hasTodayBriefing
              ? "Regenerate today's brief"
              : "Generate morning brief"}
          </button>
        </form>

        {todayBriefing?.status === "generating" ? (
          <div className="w-full rounded-xl border border-[var(--navy-border)] bg-[var(--navy-surface)] px-5 py-8 text-center">
            <p className="text-sm font-medium text-[var(--foreground)]">
              Generating today&apos;s brief…
            </p>
            <p className="mt-1.5 text-sm text-[var(--navy-muted)]">
              Jarvis is gathering your schedule, email, tasks, and goals.
            </p>
          </div>
        ) : null}

        {todayBriefing?.status === "failed" ? (
          <p className="w-full rounded-lg border border-[rgba(248,113,113,0.25)] bg-[rgba(248,113,113,0.08)] px-4 py-3 text-sm text-red-400">
            {todayBriefing.safe_error_message ??
              "Jarvis could not generate the morning brief."}
          </p>
        ) : null}

        {mostRecentCompleted?.content ? (
          <article className="flex w-full flex-col gap-4 rounded-xl border border-[var(--navy-border)] bg-[var(--navy-surface)] px-5 py-5">
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--navy-muted)]">
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
            <BriefingContent content={mostRecentCompleted.content} />
          </article>
        ) : todayBriefing?.status !== "generating" ? (
          <div className="w-full rounded-xl border border-dashed border-[var(--navy-border)] bg-[var(--navy-surface)] px-5 py-10 text-center">
            <p className="text-sm font-medium text-[var(--foreground)]">
              No brief yet
            </p>
            <p className="mt-1.5 text-sm text-[var(--navy-muted)]">
              Generate your first morning brief to see your day at a glance.
            </p>
          </div>
        ) : null}

        {historyRows.length > 0 ? (
          <section
            className="flex w-full flex-col gap-2"
            aria-label="Briefing history"
          >
            <h2 className="text-sm font-medium text-[var(--navy-muted)]">
              Earlier briefs
            </h2>
            <ul className="flex w-full flex-col gap-2">
              {historyRows.map((row) => (
                <li
                  key={row.id}
                  className="rounded-lg border border-[var(--navy-border)] bg-[var(--navy-surface)] px-4 py-3 text-sm text-[var(--foreground)]"
                >
                  {formatBriefingDate(row.briefing_date)}
                  {row.generated_at ? (
                    <span className="ml-2 text-xs text-[var(--navy-muted)]">
                      ·{" "}
                      {formatGeneratedAt(row.generated_at, row.timezone)}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <Link
          href="/"
          className="text-sm font-medium text-[var(--navy-muted)] transition-colors hover:text-[var(--foreground)]"
        >
          ← Back to home
        </Link>
      </main>
    </div>
  );
}
