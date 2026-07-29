import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { completeTask, createTask } from "./actions";

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getClaims();

  if (authError || !authData?.claims) {
    redirect("/login");
  }

  const { data: tasks } = await supabase
    .from("tasks")
    .select("id, title, status, priority, due_at, created_at")
    .order("created_at", { ascending: false });

  return (
    <div className="home">
      <main className="home-main">
        <header className="home-header">
          <h1 className="home-title">Tasks</h1>
          <p className="home-subtitle">
            Everything Jarvis needs to help you complete.
          </p>
        </header>

        <form
          action={createTask}
          className="flex w-full flex-col gap-4 rounded-xl border border-[var(--navy-border)] bg-[var(--navy-surface)] p-7"
        >
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-[var(--navy-muted)]">
              Task title
            </span>
            <input
              type="text"
              name="title"
              required
              maxLength={200}
              placeholder="What needs to get done?"
              className="rounded-lg border border-[var(--navy-border)] bg-[var(--background)] px-3 py-2.5 text-sm text-[var(--foreground)] placeholder:text-[var(--navy-muted)] focus:border-[rgba(148,163,184,0.22)] focus:outline-none"
            />
          </label>

          {error ? (
            <p className="text-center text-sm text-red-400">{error}</p>
          ) : null}

          <button
            type="submit"
            className="mt-1 rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            Add task
          </button>
        </form>

        <section className="flex w-full flex-col gap-3" aria-label="Task list">
          {tasks && tasks.length > 0 ? (
            tasks.map((task) => (
              <article
                key={task.id}
                className="flex items-center justify-between gap-4 rounded-xl border border-[var(--navy-border)] bg-[var(--navy-surface)] px-5 py-4"
              >
                <h2
                  className={
                    task.status === "done"
                      ? "text-sm font-medium text-[var(--navy-muted)] line-through"
                      : "text-sm font-medium text-[var(--foreground)]"
                  }
                >
                  {task.title}
                </h2>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="rounded-full border border-[var(--navy-border)] px-2.5 py-0.5 text-xs font-medium capitalize text-[var(--navy-muted)]">
                    {task.priority}
                  </span>
                  {task.status === "done" ? (
                    <span className="rounded-full border border-[var(--navy-border)] px-2.5 py-0.5 text-xs font-medium text-[var(--navy-muted)]">
                      Completed
                    </span>
                  ) : (
                    <form action={completeTask}>
                      <input type="hidden" name="taskId" value={task.id} />
                      <button
                        type="submit"
                        className="rounded-lg border border-[var(--navy-border)] px-3 py-1 text-xs font-medium text-[var(--foreground)] transition-colors hover:bg-[var(--background)]"
                      >
                        Mark complete
                      </button>
                    </form>
                  )}
                </div>
              </article>
            ))
          ) : (
            <div className="rounded-xl border border-dashed border-[var(--navy-border)] bg-[var(--navy-surface)] px-5 py-10 text-center">
              <p className="text-sm font-medium text-[var(--foreground)]">
                No tasks yet
              </p>
              <p className="mt-1.5 text-sm text-[var(--navy-muted)]">
                Add one above to get started.
              </p>
            </div>
          )}
        </section>

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
