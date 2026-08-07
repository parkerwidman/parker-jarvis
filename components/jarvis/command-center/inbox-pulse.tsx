"use client";

import type { CommandCenterInbox } from "@/lib/jarvis/dashboard/load-command-center";

type InboxPulseProps = {
  inbox: CommandCenterInbox;
};

export function InboxPulse({ inbox }: InboxPulseProps) {
  return (
    <div className="cc2-pulse-panel">
      <div className="cc2-pulse-head">
        <span className="cc2-pulse-head-title">Outlook inbox</span>
        {inbox.connected && inbox.unreadCount > 0 ? (
          <span className="cc2-unread-badge">
            {inbox.unreadCount} unread
          </span>
        ) : null}
      </div>

      {inbox.emptyMessage ? (
        <p className="cc2-pulse-empty">{inbox.emptyMessage}</p>
      ) : (
        inbox.messages.map((message, index) => (
          <div key={`${message.senderDisplay}-${message.subject}-${index}`} className="cc2-mail-row">
            {!message.isRead ? (
              <span className="cc2-mail-dot" aria-label="Unread" />
            ) : (
              <span className="cc2-mail-dot cc2-mail-dot--read" aria-hidden="true" />
            )}
            <div>
              <div className="cc2-mail-from">{message.senderDisplay}</div>
              <div className="cc2-mail-sub">{message.subject}</div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
