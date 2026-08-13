import Link from "next/link";
import { MelusiPanel } from "@/components/melusi/command-center/melusi-panel";
import { MelusiWarningIcon } from "@/components/melusi/melusi-icons";
import type { MelusiAttentionItem } from "@/lib/jarvis/melusi/build-melusi-command-center-view";

const SEVERITY_LABELS: Record<MelusiAttentionItem["severity"], string> = {
  urgent: "Urgent",
  warning: "Warning",
  opportunity: "Opportunity",
  informational: "Info",
};

export function MelusiNeedsAttentionSection({
  items,
}: {
  items: MelusiAttentionItem[];
}) {
  if (items.length === 0) {
    return (
      <p className="melusi-attention-bar melusi-attention-bar--calm" role="status">
        Nothing urgent requires your attention.
      </p>
    );
  }

  return (
    <MelusiPanel title="Needs Attention" className="melusi-attention-panel melusi-glass-surface">
      <ul className="melusi-attention-cards">
        {items.map((item) => (
          <li
            key={item.id}
            className={`melusi-attention-card melusi-attention-card--${item.severity === "opportunity" ? "informational" : item.severity}`}
          >
            <div className="melusi-attention-card-head">
              <span className="melusi-attention-card-icon" aria-hidden="true">
                <MelusiWarningIcon />
              </span>
              <span className="melusi-attention-card-label">
                {SEVERITY_LABELS[item.severity]}
              </span>
            </div>
            {item.href ? (
              <Link href={item.href} className="melusi-attention-card-message">
                {item.message}
              </Link>
            ) : (
              <p className="melusi-attention-card-message">{item.message}</p>
            )}
          </li>
        ))}
      </ul>
    </MelusiPanel>
  );
}
