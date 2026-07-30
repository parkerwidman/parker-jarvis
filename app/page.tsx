import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function Home() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims) {
    redirect("/login");
  }

  const cards = ["Calendar", "Tasks", "Email"];

  return (
    <div className="home relative">
      <form action="/auth/signout" method="post" className="absolute top-6 right-6">
        <button
          type="submit"
          className="rounded-lg border border-[var(--navy-border)] bg-[var(--navy-surface)] px-3 py-1.5 text-sm font-medium text-[var(--navy-muted)] transition-colors hover:border-[rgba(148,163,184,0.22)] hover:text-[var(--foreground)]"
        >
          Sign out
        </button>
      </form>

      <main className="home-main">
        <header className="home-header">
          <h1 className="home-title">Parker&apos;s Jarvis.</h1>
          <p className="home-subtitle">Your personal AI command center.</p>
        </header>

        <Link
          href="/assistant"
          className="home-card w-full transition-colors hover:border-[rgba(59,130,246,0.35)] hover:bg-[#151f33] no-underline"
        >
          <span className="home-card-label">Open Jarvis</span>
        </Link>

        <Link
          href="/connections/microsoft"
          className="home-card w-full transition-colors hover:border-[rgba(59,130,246,0.35)] hover:bg-[#151f33] no-underline"
        >
          <span className="home-card-label">Connections</span>
        </Link>

        <Link
          href="/approvals"
          className="home-card w-full transition-colors hover:border-[rgba(59,130,246,0.35)] hover:bg-[#151f33] no-underline"
        >
          <span className="home-card-label">Approvals</span>
          <span className="mt-1 block text-xs text-[var(--navy-muted)]">
            Review sensitive actions before Jarvis performs them.
          </span>
        </Link>

        <Link
          href="/briefings"
          className="home-card w-full transition-colors hover:border-[rgba(59,130,246,0.35)] hover:bg-[#151f33] no-underline"
        >
          <span className="home-card-label">Morning Brief</span>
          <span className="mt-1 block text-xs text-[var(--navy-muted)]">
            Your schedule, priorities, email, tasks, and goals in one place.
          </span>
        </Link>

        <section className="home-cards" aria-label="Modules">
          {cards.map((label) => (
            <div key={label} className="home-card">
              <span className="home-card-label">{label}</span>
            </div>
          ))}
        </section>

        <footer className="home-footer">
          <span className="home-status">
            <span className="home-status-dot" aria-hidden="true" />
            Foundation running.
          </span>
        </footer>
      </main>
    </div>
  );
}
