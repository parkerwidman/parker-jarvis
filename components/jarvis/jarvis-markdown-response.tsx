"use client";

import { memo, type ComponentPropsWithoutRef, type JSX } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { isSafeMarkdownHref } from "@/lib/jarvis/response/safe-markdown-link";

type JarvisMarkdownResponseProps = {
  content: string;
};

type MarkdownComponentProps<T extends keyof JSX.IntrinsicElements> =
  ComponentPropsWithoutRef<T> & {
    node?: unknown;
  };

function SafeMarkdownLink({
  href,
  children,
  node: _node,
  ...props
}: MarkdownComponentProps<"a">) {
  if (!isSafeMarkdownHref(href)) {
    return <span>{children}</span>;
  }

  const isExternal = href!.startsWith("http://") || href!.startsWith("https://");

  return (
    <a
      href={href}
      {...(isExternal ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      {...props}
    >
      {children}
    </a>
  );
}

function MarkdownCode({
  className,
  children,
  node: _node,
  ...props
}: MarkdownComponentProps<"code">) {
  const isBlock = typeof className === "string" && className.includes("language-");

  if (isBlock) {
    return (
      <code className={className} {...props}>
        {children}
      </code>
    );
  }

  return (
    <code className="jarvis-markdown-inline-code" {...props}>
      {children}
    </code>
  );
}

function MarkdownPre({
  children,
  node: _node,
  ...props
}: MarkdownComponentProps<"pre">) {
  return (
    <pre className="jarvis-markdown-pre" {...props}>
      {children}
    </pre>
  );
}

function MarkdownCheckbox({
  checked,
  node: _node,
  ...props
}: MarkdownComponentProps<"input">) {
  return (
    <input
      type="checkbox"
      checked={checked}
      disabled
      readOnly
      aria-readonly="true"
      {...props}
    />
  );
}

function MarkdownTable({
  children,
  node: _node,
  ...props
}: MarkdownComponentProps<"table">) {
  return (
    <div className="jarvis-markdown-table-wrap">
      <table {...props}>{children}</table>
    </div>
  );
}

export const JarvisMarkdownResponse = memo(function JarvisMarkdownResponse({
  content,
}: JarvisMarkdownResponseProps) {
  return (
    <div className="jarvis-markdown">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: SafeMarkdownLink,
          code: MarkdownCode,
          pre: MarkdownPre,
          table: MarkdownTable,
          input: MarkdownCheckbox,
        }}
      >
        {content}
      </Markdown>
    </div>
  );
});
