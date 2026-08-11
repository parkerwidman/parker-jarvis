import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Jarvis Privacy Policy",
  description:
    "Privacy policy for the Jarvis personal application and connected services.",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-full bg-[var(--background)] text-[var(--foreground)]">
      <main className="mx-auto w-full max-w-3xl px-6 py-12 sm:px-8 sm:py-16">
        <header className="mb-10 border-b border-[var(--navy-border)] pb-8">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Jarvis Privacy Policy
          </h1>
          <p className="mt-3 text-sm text-[var(--navy-muted)]">
            Last updated: August 11, 2026
          </p>
        </header>

        <div className="space-y-10 text-base leading-relaxed text-[var(--foreground)]">
          <section>
            <h2 className="mb-3 text-xl font-semibold">Purpose</h2>
            <p className="text-[var(--navy-muted)]">
              Jarvis is a private personal application used to organize and
              analyze the owner&apos;s personal information, including connected
              health and fitness data. This policy describes how Jarvis handles
              information when services such as WHOOP are connected.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold">WHOOP data accessed</h2>
            <p className="mb-3 text-[var(--navy-muted)]">
              When you connect WHOOP to Jarvis, Jarvis may access the following
              categories of WHOOP data, depending on the permissions you grant
              during authorization:
            </p>
            <ul className="list-disc space-y-2 pl-6 text-[var(--navy-muted)]">
              <li>Profile information</li>
              <li>Recovery data</li>
              <li>Heart rate variability (HRV)</li>
              <li>Resting heart rate</li>
              <li>Sleep data</li>
              <li>Cycle and day strain</li>
              <li>Workout and activity data</li>
              <li>Body measurement data</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold">How data is used</h2>
            <p className="mb-3 text-[var(--navy-muted)]">
              WHOOP data is used within Jarvis to:
            </p>
            <ul className="list-disc space-y-2 pl-6 text-[var(--navy-muted)]">
              <li>
                Display personal fitness and health information inside Jarvis
              </li>
              <li>Provide trends and summaries</li>
              <li>
                Support future personal wellness insights requested by the user
              </li>
            </ul>
            <p className="mt-3 text-[var(--navy-muted)]">
              Jarvis is not a medical device and does not provide medical
              diagnosis or treatment.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold">
              Data storage and security
            </h2>
            <p className="text-[var(--navy-muted)]">
              Connected account credentials are stored on the server. OAuth
              tokens are encrypted and are not exposed to the browser. Fitness
              data retrieved from WHOOP is associated with the authenticated
              Jarvis account. Jarvis uses reasonable security controls intended
              to limit unauthorized access to stored data.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold">Sharing</h2>
            <p className="text-[var(--navy-muted)]">
              Personal WHOOP data is not sold. Jarvis is currently a private
              personal application, and personal data is not shared with
              advertisers.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold">
              Revoking WHOOP access
            </h2>
            <p className="text-[var(--navy-muted)]">
              Access can be revoked through WHOOP, and Jarvis will support
              removing the WHOOP connection as part of its integration
              controls.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold">Data deletion</h2>
            <p className="text-[var(--navy-muted)]">
              You may request deletion of WHOOP-derived data stored in Jarvis.
              Because Jarvis is a private personal application, deletion
              requests can be handled directly with the application owner.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold">Contact</h2>
            <p className="text-[var(--navy-muted)]">
              For privacy questions regarding Jarvis, contact the application
              owner using the contact information provided in the WHOOP
              application listing.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
