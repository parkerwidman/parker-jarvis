import Link from "next/link";
import type { ReactNode } from "react";

export function CommandCenterPanel({
  title,
  href,
  hrefLabel,
  children,
  className,
}: {
  title: string;
  href?: string;
  hrefLabel?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`cc-panel${className ? ` ${className}` : ""}`}>
      <div className="cc-panel-header">
        <h2 className="cc-panel-title">{title}</h2>
        {href && hrefLabel ? (
          <Link href={href} className="cc-panel-link">
            {hrefLabel}
          </Link>
        ) : null}
      </div>
      <div className="cc-panel-body">{children}</div>
    </section>
  );
}
