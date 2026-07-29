import { login } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="home">
      <main className="home-main">
        <header className="home-header">
          <h1 className="home-title">Parker&apos;s Jarvis</h1>
          <p className="home-subtitle">Private command center</p>
        </header>

        <form
          action={login}
          className="flex w-full flex-col gap-4 rounded-xl border border-[var(--navy-border)] bg-[var(--navy-surface)] p-7"
        >
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-[var(--navy-muted)]">
              Email
            </span>
            <input
              type="email"
              name="email"
              required
              autoComplete="email"
              className="rounded-lg border border-[var(--navy-border)] bg-[var(--background)] px-3 py-2.5 text-sm text-[var(--foreground)] placeholder:text-[var(--navy-muted)] focus:border-[rgba(148,163,184,0.22)] focus:outline-none"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-[var(--navy-muted)]">
              Password
            </span>
            <input
              type="password"
              name="password"
              required
              autoComplete="current-password"
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
            Sign In
          </button>
        </form>
      </main>
    </div>
  );
}
