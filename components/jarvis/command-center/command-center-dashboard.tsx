"use client";

import { useCallback, useState } from "react";
import type { CommandCenterData } from "@/lib/jarvis/dashboard/load-command-center";
import { AskJarvisBar } from "./ask-jarvis-bar";
import { BriefingPlayer } from "./briefing-player";
import { CalendarPulse } from "./calendar-pulse";
import { CommandCenterModeProvider } from "./command-center-mode-provider";
import { CommandKanban } from "./command-kanban";
import { GoalProgressPanel } from "./goal-progress-panel";
import { InboxPulse } from "./inbox-pulse";
import { PriorityStrip } from "./priority-strip";

type CommandCenterDashboardProps = {
  data: CommandCenterData;
  displayName: string;
  greeting: string;
};

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export function CommandCenterDashboard({
  data,
  displayName,
  greeting,
}: CommandCenterDashboardProps) {
  return (
    <CommandCenterModeProvider>
      <CommandCenterDashboardInner
        data={data}
        displayName={displayName}
        greeting={greeting}
      />
    </CommandCenterModeProvider>
  );
}

function CommandCenterDashboardInner({
  data,
  displayName,
  greeting,
}: CommandCenterDashboardProps) {
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [lastReply, setLastReply] = useState<string | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [followUpUsed, setFollowUpUsed] = useState<Set<string>>(new Set());
  const [followUpThread, setFollowUpThread] = useState<ChatMessage[]>([]);

  const sendToJarvis = useCallback(
    async (message: string, followUpKey?: string) => {
      setChatLoading(true);
      setChatError(null);

      if (followUpKey) {
        setFollowUpUsed((current) => new Set(current).add(followUpKey));
      }

      try {
        const requestBody: {
          message: string;
          agentKey: "main";
          threadId?: string;
        } = {
          message,
          agentKey: "main",
        };

        if (threadId) {
          requestBody.threadId = threadId;
        }

        const response = await fetch("/api/assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        });

        const payload = (await response.json()) as {
          reply?: string;
          error?: string;
          threadId?: string;
        };

        if (!response.ok) {
          throw new Error(payload.error ?? "Something went wrong. Please try again.");
        }

        if (typeof payload.threadId === "string") {
          setThreadId(payload.threadId);
        }

        const reply = payload.reply ?? "";
        setLastReply(reply);

        if (followUpKey) {
          setFollowUpThread((current) => [
            ...current,
            { role: "user", content: message },
            { role: "assistant", content: reply },
          ]);
        }
      } catch (error) {
        setChatError(
          error instanceof Error
            ? error.message
            : "Something went wrong. Please try again.",
        );
      } finally {
        setChatLoading(false);
      }
    },
    [threadId],
  );

  function handleFollowUp(prompt: string, key: string) {
    void sendToJarvis(prompt, key);
  }

  return (
    <div className="cc2-main">
      <header className="cc2-header">
        <h1 className="cc2-greeting">
          {greeting}, {displayName}
        </h1>
        <p className="cc2-date">{data.todayDateLabel}</p>
      </header>

      <BriefingPlayer
        transcript={data.briefingTranscript}
        priorityText={data.briefingPriorityText}
        briefingStatus={data.briefing?.status ?? null}
        audioStatus={data.briefing?.audioStatus ?? "none"}
        audioGeneratedAt={data.briefing?.audioGeneratedAt ?? null}
        briefingDate={
          data.briefingTranscript ? (data.briefing?.briefingDate ?? null) : null
        }
        onFollowUp={handleFollowUp}
        followUpLoading={chatLoading}
        followUpUsed={followUpUsed}
      />

      {followUpThread.length > 0 ? (
        <div className="cc2-followup-thread" aria-label="Follow-up responses">
          {followUpThread.map((message, index) => (
            <div
              key={`${message.role}-${index}`}
              className={`cc2-followup-msg cc2-followup-msg--${message.role}`}
            >
              {message.content}
            </div>
          ))}
        </div>
      ) : null}

      <PriorityStrip
        focusTask={data.focusTask}
        headerStatus={data.headerStatus}
      />

      <CommandKanban tasks={data.kanbanTasks} />

      <GoalProgressPanel goals={data.goalItems} />

      <div className="cc2-pulse-title">Coming at you — inbox &amp; calendar</div>
      <div className="cc2-pulse-grid">
        <InboxPulse inbox={data.inbox} />
        <CalendarPulse
          events={data.outlook.events}
          connected={data.outlook.connected}
          needsReconnect={data.outlook.needsReconnect}
          timeZone={data.timezone}
          todayDate={data.todayDate}
        />
      </div>

      <AskJarvisBar
        onSubmit={sendToJarvis}
        loading={chatLoading}
        error={chatError}
        lastReply={lastReply}
      />
    </div>
  );
}
