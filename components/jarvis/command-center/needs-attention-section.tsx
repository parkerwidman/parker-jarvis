import Link from "next/link";
import type { AttentionItem } from "@/lib/jarvis/dashboard/build-command-center-view";
import { CommandCenterPanel } from "./command-center-panel";

const SEVERITY_LABELS: Record<AttentionItem["severity"], string> = {
  urgent: "Urgent",
  warning: "Warning",
  informational: "Info",
};

export function NeedsAttentionSection({
  items,
}: {
  items: AttentionItem[];
}) {
  return (
    <CommandCenterPanel title="Needs Attention">
      {items.length === 0 ? (
        <p className="cc-empty cc-empty--calm">
          Nothing urgent requires your attention.
        </p>
      ) : (
        <ul className="cc-dash-attention">
          {items.map((item) => (
            <li
              key={item.id}
              className={`cc-dash-attention-item cc-dash-attention-item--${item.severity}`}
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
      )}
    </CommandCenterPanel>
  );
}
