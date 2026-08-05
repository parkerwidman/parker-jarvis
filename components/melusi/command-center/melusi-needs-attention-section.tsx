import Link from "next/link";
import { CommandCenterPanel } from "@/components/jarvis/command-center/command-center-panel";
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
      <p className="melusi-attention-bar" role="status">
        Nothing urgent requires your attention.
      </p>
    );
  }

  return (
    <CommandCenterPanel title="Needs Attention" className="melusi-attention-panel">
      <ul className="cc-dash-attention melusi-attention">
        {items.map((item) => (
          <li
            key={item.id}
            className={`cc-dash-attention-item cc-dash-attention-item--${item.severity === "opportunity" ? "informational" : item.severity} melusi-attention-item--${item.severity}`}
          >
            <span className="cc-dash-attention-severity">
              {SEVERITY_LABELS[item.severity]}
            </span>
            {item.href ? (
              <Link href={item.href} className="cc-dash-attention-link">
                {item.message}
              </Link>
            ) : (
              <span className="cc-dash-attention-message">{item.message}</span>
            )}
          </li>
        ))}
      </ul>
    </CommandCenterPanel>
  );
}
