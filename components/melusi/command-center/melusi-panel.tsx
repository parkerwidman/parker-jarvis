import type { ReactNode } from "react";
import Link from "next/link";

type MelusiPanelProps = {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  href?: string;
  hrefLabel?: string;
  className?: string;
};

export function MelusiPanel({
  title,
  icon,
  children,
  href,
  hrefLabel,
  className = "",
}: MelusiPanelProps) {
  return (
    <section className={`melusi-panel melusi-glass-surface${className ? ` ${className}` : ""}`}>
      <div className="melusi-panel-head">
        <div className="melusi-panel-title-wrap">
          {icon ? (
            <span className="melusi-panel-icon" aria-hidden="true">
              {icon}
            </span>
          ) : null}
          <h2 className="melusi-panel-title">{title}</h2>
        </div>
        {href && hrefLabel ? (
          <Link href={href} className="melusi-panel-link">
            {hrefLabel}
          </Link>
        ) : null}
      </div>
      <div className="melusi-panel-body">{children}</div>
    </section>
  );
}
