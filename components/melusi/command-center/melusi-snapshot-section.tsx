import Link from "next/link";
import type { MelusiSnapshotItem } from "@/lib/jarvis/melusi/build-melusi-command-center-view";

export function MelusiBusinessSnapshotStrip({
  items,
}: {
  items: MelusiSnapshotItem[];
}) {
  if (items.length === 0) {
    return null;
  }

  return (
    <section className="melusi-snapshot-strip" aria-label="Business Snapshot">
      {items.map((item) => (
        <div
          key={item.id}
          className={`melusi-snapshot-cell${item.tone ? ` melusi-snapshot-cell--${item.tone}` : ""}`}
        >
          <span className="melusi-snapshot-cell-label">{item.label}</span>
          {item.href ? (
            <Link href={item.href} className="melusi-snapshot-cell-value">
              {item.value}
            </Link>
          ) : (
            <span className="melusi-snapshot-cell-value">{item.value}</span>
          )}
        </div>
      ))}
    </section>
  );
}
