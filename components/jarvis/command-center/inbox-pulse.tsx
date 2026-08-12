"use client";

import Link from "next/link";

import type { CommandCenterInbox } from "@/lib/jarvis/dashboard/load-command-center";

type InboxPulseProps = {
  inbox: CommandCenterInbox;
  timeZone: string;
};

function formatReceivedAt(value: string | null, timeZone: string): string | null {
  if (!value) {
    return null;
  }

  return new Date(value).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  });
}

export function InboxPulse({ inbox, timeZone }: InboxPulseProps) {
  return (
    <div className="cc2-pulse-panel cc2-pulse-panel--inbox">
      <div className="cc2-pulse-head">
        <span className="cc2-pulse-head-title">Outlook inbox</span>
        {inbox.connected && inbox.unreadCount > 0 ? (
          <span className="cc2-unread-badge">
            {inbox.unreadCount} unread
          </span>
        ) : null}
      </div>

      <div
        className="cc2-panel-scroll cc2-pulse-scroll"
        aria-label="Outlook inbox messages"
        tabIndex={0}
      >
        {inbox.emptyMessage ? (
          <p className="cc2-pulse-empty">{inbox.emptyMessage}</p>
        ) : (
          inbox.messages.map((message, index) => {
            const receivedLabel = formatReceivedAt(message.receivedAt, timeZone);

            return (
              <div
                key={`${message.senderDisplay}-${message.subject}-${index}`}
                className="cc2-mail-row"
              >
                {!message.isRead ? (
                  <span className="cc2-mail-dot" aria-label="Unread" />
                ) : (
                  <span className="cc2-mail-dot cc2-mail-dot--read" aria-hidden="true" />
                )}
                <div className="cc2-mail-body">
                  <div className="cc2-mail-top">
                    <div className="cc2-mail-from">{message.senderDisplay}</div>
                    {receivedLabel ? (
                      <time className="cc2-mail-time">{receivedLabel}</time>
                    ) : null}
                  </div>
                  <div className="cc2-mail-sub">{message.subject}</div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {inbox.connected ? (
        <Link href="/connections/microsoft" className="cc2-pulse-foot-link">
          View all messages
        </Link>
      ) : null}
    </div>
  );
}
