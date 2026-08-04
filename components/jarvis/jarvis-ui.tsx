import type { ReactNode } from "react";

export function statusBadgeClass(status: string | undefined): string {
  switch (status) {
    case "completed":
    case "ready":
      return "jv-badge jv-badge--ready";
    case "generating":
    case "executing":
      return "jv-badge jv-badge--generating";
    case "failed":
      return "jv-badge jv-badge--failed";
    case "pending":
      return "jv-badge jv-badge--review";
    case "rejected":
    case "expired":
      return "jv-badge jv-badge--idle";
    default:
      return "jv-badge jv-badge--idle";
  }
}

export function approvalStatusBadgeClass(status: string): string {
  switch (status) {
    case "pending":
      return "jv-badge jv-badge--review";
    case "executing":
      return "jv-badge jv-badge--generating";
    case "completed":
      return "jv-badge jv-badge--ready";
    case "failed":
      return "jv-badge jv-badge--failed";
    case "rejected":
    case "expired":
      return "jv-badge jv-badge--idle";
    default:
      return "jv-badge jv-badge--idle";
  }
}

type JarvisCardProps = {
  title?: string;
  children: ReactNode;
  accent?: "blue" | "purple" | "amber" | "green" | "none";
  className?: string;
  scroll?: boolean;
};

export function JarvisCard({
  title,
  children,
  accent = "none",
  className = "",
  scroll = false,
}: JarvisCardProps) {
  const accentClass = accent !== "none" ? ` jv-card--${accent}` : "";
  const scrollClass = scroll ? " jv-card--scroll" : "";

  return (
    <section className={`jv-card${accentClass}${scrollClass} ${className}`.trim()}>
      {title ? <h2 className="jv-card-title">{title}</h2> : null}
      {children}
    </section>
  );
}

type JarvisSectionProps = {
  title: string;
  children: ReactNode;
  className?: string;
};

export function JarvisSection({ title, children, className = "" }: JarvisSectionProps) {
  return (
    <section className={`jv-section ${className}`.trim()} aria-label={title}>
      <h2 className="jv-section-label">{title}</h2>
      {children}
    </section>
  );
}

type JarvisEmptyStateProps = {
  title: string;
  description: string;
};

export function JarvisEmptyState({ title, description }: JarvisEmptyStateProps) {
  return (
    <div className="jv-empty">
      <p className="jv-empty-title">{title}</p>
      <p className="jv-empty-desc">{description}</p>
    </div>
  );
}

type JarvisAlertProps = {
  variant: "success" | "error" | "info";
  children: ReactNode;
};

export function JarvisAlert({ variant, children }: JarvisAlertProps) {
  return <p className={`jv-alert jv-alert--${variant}`}>{children}</p>;
}

type JarvisButtonProps = {
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost";
  className?: string;
  type?: "button" | "submit";
  disabled?: boolean;
};

export function JarvisButton({
  children,
  variant = "primary",
  className = "",
  type = "button",
  disabled,
}: JarvisButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled}
      className={`jv-btn jv-btn--${variant} ${className}`.trim()}
    >
      {children}
    </button>
  );
}

type JarvisFieldProps = {
  label: string;
  children: ReactNode;
  htmlFor?: string;
};

export function JarvisField({ label, children, htmlFor }: JarvisFieldProps) {
  return (
    <label className="jv-field" htmlFor={htmlFor}>
      <span className="jv-field-label">{label}</span>
      {children}
    </label>
  );
}

const inputClassName = "jv-input";

export function jarvisInputProps(className = "") {
  return { className: `${inputClassName} ${className}`.trim() };
}

type JarvisPageContentProps = {
  children: ReactNode;
  className?: string;
};

export function JarvisPageContent({ children, className = "" }: JarvisPageContentProps) {
  return (
    <div className={`jv-page-content ${className}`.trim()}>
      {children}
    </div>
  );
}

type MarkdownContentProps = {
  content: string;
};

export function JarvisMarkdownContent({ content }: MarkdownContentProps) {
  const lines = content.split("\n");

  return (
    <div className="jv-markdown">
      {lines.map((line, index) => {
        const trimmed = line.trim();

        if (trimmed.startsWith("# ")) {
          return (
            <h2 key={index} className="jv-markdown-h2">
              {trimmed.slice(2)}
            </h2>
          );
        }

        if (trimmed.startsWith("## ")) {
          return (
            <h3 key={index} className="jv-markdown-h3">
              {trimmed.slice(3)}
            </h3>
          );
        }

        if (trimmed.startsWith("### ")) {
          return (
            <h4 key={index} className="jv-markdown-h4">
              {trimmed.slice(4)}
            </h4>
          );
        }

        if (trimmed.length === 0) {
          return <div key={index} className="jv-markdown-spacer" aria-hidden="true" />;
        }

        return (
          <p key={index} className="jv-markdown-p">
            {line}
          </p>
        );
      })}
    </div>
  );
}
