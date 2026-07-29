import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { AssistantChat } from "./assistant-chat";

export default async function AssistantPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims) {
    redirect("/login");
  }

  return (
    <div className="home">
      <main className="home-main max-w-2xl">
        <header className="home-header">
          <h1 className="home-title">Jarvis</h1>
          <p className="home-subtitle">Your personal AI command center.</p>
        </header>

        <AssistantChat />

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
