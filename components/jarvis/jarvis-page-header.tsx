import Link from "next/link";
import type { ReactNode } from "react";

type JarvisPageHeaderProps = {
  title: string;
  subtitle?: string;
  backHref?: string;
  backLabel?: string;
  meta?: ReactNode;
};

export function JarvisPageHeader({
  title,
  subtitle,
  backHref,
  backLabel = "Command Center",
  meta,
}: JarvisPageHeaderProps) {
  return (
    <header className="jv-page-header">
      <div className="jv-page-header-main">
        {backHref ? (
          <Link href={backHref} className="jv-back-link">
            ← {backLabel}
          </Link>
        ) : null}
        <h1 className="jv-page-title">{title}</h1>
        {subtitle ? <p className="jv-page-subtitle">{subtitle}</p> : null}
      </div>
      {meta ? <div className="jv-page-header-meta">{meta}</div> : null}
    </header>
  );
}
