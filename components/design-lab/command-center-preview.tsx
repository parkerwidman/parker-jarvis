"use client";

import { useCallback, useEffect, useState } from "react";

import styles from "./command-center-preview.module.css";

const REFERENCE_OVERLAY_SRC = "/design-lab/command-center-reference.png";

const SIDEBAR_SECTIONS = [
  {
    title: null,
    links: [
      { label: "Command Center", active: true, icon: "command" as const },
      { label: "Finance", active: false, icon: "finance" as const },
      { label: "Fitness", active: false, icon: "fitness" as const },
    ],
  },
  {
    title: "GOALS",
    links: [
      { label: "Short Term Goals", active: false, icon: "goals" as const },
      { label: "3 Month Goals", active: false, icon: "goals" as const },
      { label: "Long Term Goals", active: false, icon: "goals" as const },
    ],
  },
  {
    title: "MELUSI",
    links: [{ label: "Melusi", active: false, accent: "melusi" as const, icon: "melusi" as const }],
  },
  {
    title: "ASSISTANT",
    links: [
      { label: "Tasks", active: false, icon: "tasks" as const },
      { label: "Assistant", active: false, icon: "assistant" as const },
      { label: "Morning Brief", active: false, icon: "brief" as const },
      { label: "Daily Plan", active: false, icon: "plan" as const },
      { label: "Approvals", active: false, icon: "approvals" as const },
    ],
  },
  {
    title: "CONNECTIONS",
    links: [{ label: "Microsoft", active: false, icon: "microsoft" as const }],
  },
] as const;

type NavIconName = (typeof SIDEBAR_SECTIONS)[number]["links"][number]["icon"];

const TODO_TASKS = [
  {
    title: "Apply for study abroad program",
    tag: "Personal",
    priority: "High priority",
    priorityTone: "high" as const,
  },
  {
    title: "Review Melusi business plan",
    tag: "Personal",
    priority: "Medium priority",
    priorityTone: "medium" as const,
  },
];

const DONE_TASKS = [
  { title: "Test Jarvis task", tag: "Personal" },
  { title: "Review Melusi business plan", tag: "Personal" },
];

const INBOX = [
  { sender: "Study Abroad Office", subject: "Application deadline reminder", time: "2h ago" },
  { sender: "Melusi Team", subject: "Q1 strategy review notes", time: "4h ago" },
  { sender: "Amazon", subject: "Your order has shipped", time: "6h ago" },
];

const CALENDAR = [
  { time: "9:00 AM", title: "Focus time", tone: "cyan" as const },
  { time: "11:30 AM", title: "Melusi strategy sync", tone: "purple" as const },
  { time: "5:00 PM", title: "Workout", tone: "blue" as const },
];

const GLANCE = [
  { label: "Focus time", value: "2h 30m" },
  { label: "Tasks completed", value: "2 / 4" },
  { label: "Meetings", value: "2" },
  { label: "Focus score", value: "87", sub: "Excellent" },
];

const QUICK_ACTIONS = [
  "Start Focus Session",
  "Morning Brief",
  "Daily Plan",
  "Approvals",
];

function roundSvg(value: number) {
  return Number(value.toFixed(3));
}

function polarPoint(center: number, radius: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: roundSvg(center + Math.cos(rad) * radius),
    y: roundSvg(center + Math.sin(rad) * radius),
  };
}

function NavIcon({ name, active }: { name: NavIconName; active?: boolean }) {
  const color = active ? "#8ec5ff" : "currentColor";

  switch (name) {
    case "command":
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1" stroke={color} strokeWidth="1.2" />
          <rect x="9" y="2.5" width="4.5" height="4.5" rx="1" stroke={color} strokeWidth="1.2" />
          <rect x="2.5" y="9" width="4.5" height="4.5" rx="1" stroke={color} strokeWidth="1.2" />
          <rect x="9" y="9" width="4.5" height="4.5" rx="1" stroke={color} strokeWidth="1.2" />
        </svg>
      );
    case "finance":
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M3 12V6.5l5-3 5 3V12" stroke={color} strokeWidth="1.2" strokeLinejoin="round" />
          <path d="M6.5 12V9h3v3" stroke={color} strokeWidth="1.2" />
        </svg>
      );
    case "fitness":
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M3 8h2.5l1-2 2 4 1-2H13" stroke={color} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "goals":
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <circle cx="8" cy="8" r="4.75" stroke={color} strokeWidth="1.2" />
          <circle cx="8" cy="8" r="1.5" fill={color} />
        </svg>
      );
    case "melusi":
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M8 2.5l1.4 3.2 3.5.3-2.7 2.3.8 3.4L8 10.2 5 11.7l.8-3.4-2.7-2.3 3.5-.3L8 2.5z" stroke={color} strokeWidth="1.1" strokeLinejoin="round" />
        </svg>
      );
    case "tasks":
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <rect x="3" y="3" width="10" height="10" rx="1.5" stroke={color} strokeWidth="1.2" />
          <path d="M5.5 8l1.5 1.5L10.5 6" stroke={color} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "assistant":
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <circle cx="8" cy="6.5" r="2.25" stroke={color} strokeWidth="1.2" />
          <path d="M4 13c0-2.2 1.8-4 4-4s4 1.8 4 4" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      );
    case "brief":
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <circle cx="8" cy="8" r="4" stroke={color} strokeWidth="1.2" />
          <path d="M8 5.5V8l1.75 1" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      );
    case "plan":
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <rect x="3.5" y="2.5" width="9" height="11" rx="1.2" stroke={color} strokeWidth="1.2" />
          <path d="M5.5 6h5M5.5 8.5h5M5.5 11h3" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      );
    case "approvals":
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <rect x="3" y="3.5" width="10" height="9" rx="1.2" stroke={color} strokeWidth="1.2" />
          <path d="M5.5 8l1.5 1.5 3.5-3.5" stroke={color} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "microsoft":
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <rect x="2.5" y="2.5" width="4.5" height="4.5" fill="#F25022" />
          <rect x="9" y="2.5" width="4.5" height="4.5" fill="#7FBA00" />
          <rect x="2.5" y="9" width="4.5" height="4.5" fill="#00A4EF" />
          <rect x="9" y="9" width="4.5" height="4.5" fill="#FFB900" />
        </svg>
      );
  }
}

function BrandMark() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <path
        d="M14 3L24 8.5V19.5L14 25L4 19.5V8.5L14 3Z"
        stroke="#67B4FF"
        strokeWidth="1.5"
      />
      <path
        d="M14 8L19 10.75V16.25L14 19L9 16.25V10.75L14 8Z"
        fill="rgba(77,163,255,0.35)"
      />
    </svg>
  );
}

function PriorityOrbital() {
  return (
    <div className={styles.priorityOrbital} aria-hidden="true">
      <div className={styles.priorityOrbitalGlow} />
      <svg className={styles.priorityOrbitalSvg} viewBox="0 0 120 120">
        <circle cx="60" cy="60" r="54" fill="none" stroke="rgba(77,163,255,0.28)" strokeWidth="1" />
        <circle cx="60" cy="60" r="46" fill="none" stroke="rgba(103,180,255,0.48)" strokeWidth="1" strokeDasharray="4 6" />
        <circle cx="60" cy="60" r="38" fill="none" stroke="rgba(125,185,255,0.62)" strokeWidth="1.2" />
        <circle cx="60" cy="60" r="30" fill="none" stroke="rgba(77,163,255,0.82)" strokeWidth="1.5" strokeDasharray="3 5" />
        {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => {
          const { x, y } = polarPoint(60, 38, angle);
          return (
            <circle key={angle} cx={x} cy={y} r="1.2" fill="rgba(125,212,255,0.75)" />
          );
        })}
      </svg>
      <div className={styles.priorityOrbitalCore}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path d="M12 3L4 8v8l8 5 8-5V8l-8-5z" stroke="currentColor" strokeWidth="1.4" />
          <path d="M8 12h8M12 8v8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </div>
    </div>
  );
}

function StatusRing() {
  return (
    <div className={styles.statusRing} aria-hidden="true">
      <svg className={styles.statusRingSvg} viewBox="0 0 200 200">
        <defs>
          <linearGradient id="dl-status-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#22D3EE" />
            <stop offset="35%" stopColor="#4DA3FF" />
            <stop offset="68%" stopColor="#7C6CFF" />
            <stop offset="100%" stopColor="#D946EF" />
          </linearGradient>
        </defs>
        <circle cx="100" cy="100" r="84" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1" strokeDasharray="2 7" />
        {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((angle) => {
          const { x, y } = polarPoint(100, 84, angle);
          return (
            <circle key={angle} cx={x} cy={y} r="1.2" fill="rgba(125,185,255,0.35)" />
          );
        })}
        <circle cx="100" cy="100" r="74" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="14" />
        <circle
          cx="100"
          cy="100"
          r="74"
          fill="none"
          stroke="url(#dl-status-gradient)"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray="420 48"
          transform="rotate(-90 100 100)"
        />
      </svg>
      <div className={styles.statusRingCenter}>
        <p className={styles.statusHeadline}>All Systems</p>
        <p className={styles.statusDetail}>Optimal</p>
        <div className={styles.statusWave}>
          <span /><span /><span /><span /><span />
        </div>
      </div>
    </div>
  );
}

function GoalRing() {
  return (
    <div className={styles.goalRing} aria-hidden="true">
      <svg viewBox="0 0 120 120" className={styles.goalRingSvg}>
        <defs>
          <linearGradient id="dl-goal-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#4DA3FF" />
            <stop offset="100%" stopColor="#A78BFA" />
          </linearGradient>
          <linearGradient id="dl-goal-track" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="rgba(77,163,255,0.45)" />
            <stop offset="100%" stopColor="rgba(167,139,250,0.38)" />
          </linearGradient>
        </defs>
        <circle cx="60" cy="60" r="48" fill="none" stroke="url(#dl-goal-track)" strokeWidth="10" />
        <circle
          cx="60"
          cy="60"
          r="48"
          fill="none"
          stroke="url(#dl-goal-gradient)"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray="226 76"
          transform="rotate(-90 60 60)"
        />
      </svg>
      <span className={styles.goalRingValue}>72%</span>
    </div>
  );
}

function GlanceSparkline() {
  return (
    <svg className={styles.glanceSparkline} viewBox="0 0 200 40" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="dl-sparkline" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(77,163,255,0.35)" />
          <stop offset="100%" stopColor="rgba(77,163,255,0)" />
        </linearGradient>
      </defs>
      <path
        d="M0 32 L20 28 L40 30 L60 22 L80 24 L100 14 L120 18 L140 10 L160 12 L180 6 L200 8 L200 40 L0 40 Z"
        fill="url(#dl-sparkline)"
      />
      <path
        d="M0 32 L20 28 L40 30 L60 22 L80 24 L100 14 L120 18 L140 10 L160 12 L180 6 L200 8"
        fill="none"
        stroke="#4DA3FF"
        strokeWidth="1.5"
      />
    </svg>
  );
}

export function CommandCenterPreview() {
  const [overlayVisible, setOverlayVisible] = useState(false);

  const toggleOverlay = useCallback(() => {
    setOverlayVisible((value) => !value);
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "r" || event.key === "R") {
        setOverlayVisible((value) => !value);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarBrand}>
          <BrandMark />
          <span className={styles.sidebarWordmark}>JARVIS</span>
        </div>

        <nav className={styles.sidebarNav}>
          {SIDEBAR_SECTIONS.map((section) => (
            <div key={section.title ?? "main"} className={styles.sidebarSection}>
              {section.title ? (
                <p className={styles.sidebarSectionTitle}>{section.title}</p>
              ) : null}
              <ul className={styles.sidebarList}>
                {section.links.map((link) => (
                  <li key={link.label}>
                    <span
                      className={[
                        styles.sidebarLink,
                        link.active ? styles.sidebarLinkActive : "",
                        "accent" in link && link.accent === "melusi" ? styles.sidebarLinkMelusi : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      <span className={styles.sidebarIcon}>
                        <NavIcon name={link.icon} active={link.active} />
                      </span>
                      <span className={styles.sidebarLabel}>{link.label}</span>
                      {link.active ? <span className={styles.sidebarActiveBar} /> : null}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className={styles.profileCard}>
          <div className={styles.profileAvatar}>P</div>
          <div className={styles.profileCopy}>
            <p className={styles.profileName}>Parker</p>
            <p className={styles.profilePlan}>Pro Plan</p>
          </div>
          <span className={styles.profileChevron} aria-hidden="true">
            ›
          </span>
        </div>
      </aside>

      <div className={styles.mainColumn}>
        <div className={styles.horizon} aria-hidden="true">
          <img
            className={styles.horizonImage}
            src="/jarvis/planet-horizon.webp"
            alt=""
          />
          <div className={styles.horizonStars} />
          <div className={styles.horizonGlow} />
          <div className={styles.horizonFade} />
        </div>

        <header className={styles.header}>
          <div className={styles.headerGrid}>
            <div className={styles.headerMain}>
              <div className={styles.headerCopy}>
                <h1 className={styles.greeting}>
                  Good afternoon, <span className={styles.greetingName}>Parker</span>
                </h1>
                <p className={styles.tagline}>You&apos;ve got clarity. I&apos;ll handle the rest.</p>
              </div>
              <div className={styles.modeSwitch} role="group" aria-label="Mode">
                <span className={styles.modeSwitchActive}>Personal</span>
                <span className={styles.modeSwitchIdle}>Melusi</span>
              </div>
            </div>
            <div className={styles.headerUtilities}>
              <button type="button" className={styles.iconButton} aria-label="Notifications">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M8 2.5a4 4 0 0 1 4 4v2.5l.75 1.5H3.25L4 9V6.5a4 4 0 0 1 4-4z" stroke="currentColor" strokeWidth="1.2" />
                  <path d="M6.5 12.5a1.5 1.5 0 0 0 3 0" stroke="currentColor" strokeWidth="1.2" />
                </svg>
              </button>
              <button type="button" className={styles.iconButton} aria-label="Settings">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="8" r="2.25" stroke="currentColor" strokeWidth="1.2" />
                  <path d="M8 1.5v1.2M8 13.3v1.2M1.5 8h1.2M13.3 8h1.2M3.2 3.2l.85.85M11.95 11.95l.85.85M3.2 12.8l.85-.85M11.95 4.05l.85-.85" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          </div>
        </header>

        <div className={styles.dashboardGrid}>
          <div className={styles.dashboardMain}>
            <section className={styles.priorityHero}>
              <PriorityOrbital />
              <div className={styles.priorityCopy}>
                <span className={styles.priorityEyebrow}>Top priority</span>
                <h2 className={styles.priorityTitle}>Apply for study abroad</h2>
                <p className={styles.prioritySub}>
                  Your Florence window is closing — this is the one to move first.
                </p>
              </div>
              <div className={styles.priorityActions}>
                <button type="button" className={styles.primaryButton}>
                  <span className={styles.primaryButtonIcon}>▶</span>
                  Start 25-minute focus
                </button>
                <button type="button" className={styles.ghostButton}>
                  View details
                </button>
              </div>
              <button type="button" className={styles.priorityStar} aria-label="Favorite">
                ★
              </button>
            </section>

            <section className={styles.tasksPanel}>
              <div className={styles.tasksHeader}>
                <span className={styles.panelEyebrow}>Tasks</span>
                <span className={styles.tasksModeTag}>Personal view</span>
              </div>
              <div className={styles.kanban}>
                <div className={styles.kanbanColumn}>
                  <div className={styles.kanbanColumnHead}>
                    <span>To do</span>
                    <span className={styles.kanbanCount}>2</span>
                  </div>
                  <div className={styles.kanbanScroll}>
                    {TODO_TASKS.map((task) => (
                      <article key={task.title} className={styles.taskCard}>
                        <div className={styles.taskCardTop}>
                          <span className={styles.taskCheck} />
                          <div className={styles.taskCardBody}>
                            <p className={styles.taskTitle}>{task.title}</p>
                            <div className={styles.taskMeta}>
                              <span className={styles.taskTag}>{task.tag}</span>
                              <span className={`${styles.taskPriority} ${styles[`taskPriority${task.priorityTone.charAt(0).toUpperCase()}${task.priorityTone.slice(1)}`]}`}>
                                {task.priority}
                              </span>
                            </div>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                </div>

                <div className={styles.kanbanColumn}>
                  <div className={styles.kanbanColumnHead}>
                    <span>In progress</span>
                    <span className={styles.kanbanCount}>0</span>
                  </div>
                  <div className={styles.kanbanScroll}>
                    <div className={styles.emptyState}>
                      <div className={styles.emptyOrbit} aria-hidden="true">
                        <span className={styles.emptyRingOuter} />
                        <span className={styles.emptyRingTilt} />
                        <span className={styles.emptyPlanet} />
                      </div>
                      <p className={styles.emptyTitle}>Nothing in progress</p>
                      <p className={styles.emptySub}>You&apos;re all caught up!</p>
                    </div>
                  </div>
                </div>

                <div className={styles.kanbanColumn}>
                  <div className={styles.kanbanColumnHead}>
                    <span>Done</span>
                    <span className={styles.kanbanCount}>2</span>
                  </div>
                  <div className={styles.kanbanScroll}>
                    {DONE_TASKS.map((task) => (
                      <article key={task.title} className={`${styles.taskCard} ${styles.taskCardDone}`}>
                        <div className={styles.taskCardTop}>
                          <span className={styles.taskCheckDone}>✓</span>
                          <div className={styles.taskCardBody}>
                            <p className={styles.taskTitleDone}>{task.title}</p>
                            <div className={styles.taskMeta}>
                              <span className={styles.taskTag}>{task.tag}</span>
                              <span className={styles.taskCompletedLabel}>Completed today</span>
                            </div>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            <div className={styles.lowerBand}>
              <section className={styles.panel}>
                <div className={styles.panelHead}>
                  <span className={styles.panelEyebrow}>Goal progress</span>
                  <span className={styles.panelLink}>View goal</span>
                </div>
                <div className={styles.goalRow}>
                  <GoalRing />
                  <div className={styles.goalCopy}>
                    <h3 className={styles.goalTitle}>
                      Build Jarvis into my complete personal AI command center
                    </h3>
                    <p className={styles.goalMeta}>On track • 5 milestones remaining</p>
                    <div className={styles.goalBarTrack}>
                      <div className={styles.goalBarFill} style={{ width: "72%" }} />
                    </div>
                  </div>
                </div>
              </section>

              <section className={styles.panel}>
                <div className={styles.panelHead}>
                  <div className={styles.inboxTitleRow}>
                    <span className={styles.outlookMark}>O</span>
                    <span className={styles.panelEyebrow}>Outlook Inbox</span>
                  </div>
                  <span className={styles.unreadBadge}>5 unread</span>
                </div>
                <ul className={styles.inboxList}>
                  {INBOX.map((item) => (
                    <li key={item.subject} className={styles.inboxItem}>
                      <div className={styles.inboxSenderRow}>
                        <span className={styles.inboxSender}>{item.sender}</span>
                        <span className={styles.inboxTime}>{item.time}</span>
                      </div>
                      <p className={styles.inboxSubject}>{item.subject}</p>
                    </li>
                  ))}
                </ul>
                <span className={styles.panelFootLink}>View all messages</span>
              </section>

              <section className={styles.panel}>
                <div className={styles.panelHead}>
                  <span className={styles.panelEyebrow}>Today&apos;s Calendar</span>
                  <span className={styles.panelLink}>View full day</span>
                </div>
                <ul className={styles.calendarList}>
                  {CALENDAR.map((event) => (
                    <li key={event.title} className={styles.calendarItem}>
                      <span className={`${styles.calendarDot} ${styles[`calendarDot${event.tone.charAt(0).toUpperCase()}${event.tone.slice(1)}`]}`} />
                      <div className={styles.calendarCopy}>
                        <span className={styles.calendarTime}>{event.time}</span>
                        <span className={styles.calendarTitle}>{event.title}</span>
                      </div>
                    </li>
                  ))}
                </ul>
                <span className={styles.panelFootMeta}>3 events scheduled</span>
              </section>

              <section className={styles.panel}>
                <div className={styles.panelHead}>
                  <span className={styles.panelEyebrow}>Today at a Glance</span>
                </div>
                <ul className={styles.glanceList}>
                  {GLANCE.map((item) => (
                    <li key={item.label} className={styles.glanceItem}>
                      <span className={styles.glanceLabel}>{item.label}</span>
                      <span className={styles.glanceValue}>
                        {item.value}
                        {item.sub ? <small className={styles.glanceSub}>{item.sub}</small> : null}
                      </span>
                    </li>
                  ))}
                </ul>
                <GlanceSparkline />
              </section>
            </div>
          </div>

          <aside className={styles.rightRail}>
            <section className={styles.statusCard}>
              <span className={styles.railEyebrow}>Jarvis Status</span>
              <StatusRing />
            </section>

            <section className={styles.actionsCard}>
              <span className={styles.railEyebrow}>Quick Actions</span>
              <ul className={styles.actionsList}>
                {QUICK_ACTIONS.map((label) => (
                  <li key={label}>
                    <button type="button" className={styles.actionRow}>
                      <span className={styles.actionIcon}>◎</span>
                      <span className={styles.actionLabel}>{label}</span>
                      <span className={styles.actionChevron}>›</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>

            <section className={styles.insightCard}>
              <div className={styles.insightHead}>
                <span className={styles.insightIcon}>✦</span>
                <span className={styles.railEyebrow}>AI Insight</span>
              </div>
              <p className={styles.insightCopy}>
                Good momentum today. You&apos;ve completed 2 tasks and are on track to hit all
                your goals this week.
              </p>
              <div className={styles.insightOrb} aria-hidden="true">
                <span className={styles.insightOrbRing} />
                <span className={styles.insightOrbCore} />
              </div>
            </section>
          </aside>
        </div>
      </div>

      <div className={styles.devToolbar}>
        <button type="button" className={styles.devToolbarButton} onClick={toggleOverlay}>
          {overlayVisible ? "Hide reference (R)" : "Show reference (R)"}
        </button>
      </div>

      {overlayVisible ? (
        <div className={styles.referenceOverlay} aria-hidden="true">
          <img src={REFERENCE_OVERLAY_SRC} alt="" className={styles.referenceImage} />
        </div>
      ) : null}
    </div>
  );
}
