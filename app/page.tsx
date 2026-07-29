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
    <div className="home">
      <main className="home-main">
        <header className="home-header">
          <h1 className="home-title">Parker&apos;s Jarvis.</h1>
          <p className="home-subtitle">Your personal AI command center.</p>
        </header>

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
