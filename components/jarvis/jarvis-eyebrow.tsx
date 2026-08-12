import type { ReactNode } from "react";

type JarvisEyebrowProps = {
  children: ReactNode;
  className?: string;
  as?: "p" | "span" | "h2" | "h3";
};

export function JarvisEyebrow({
  children,
  className = "",
  as: Tag = "p",
}: JarvisEyebrowProps) {
  return (
    <Tag className={`jarvis-text-eyebrow ${className}`.trim()}>{children}</Tag>
  );
}
