import { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type BadgeTone = "default" | "success" | "warning" | "danger" | "info";

export interface HorizontalCardBadgeProps {
  label: string;
  value: string | number;
  tone?: BadgeTone;
  icon?: ReactNode;
}

const TONE_CLASSES: Record<BadgeTone, string> = {
  default: "bg-surface-200 text-foreground-light border-default",
  success: "bg-brand-200 text-brand-600 border-brand-300",
  warning: "bg-warning-200 text-warning-600 border-warning-400",
  danger: "bg-destructive-200 text-destructive-600 border-destructive-300",
  info: "bg-surface-200 text-foreground-light border-strong",
};

export function HorizontalCardBadge({
  label,
  value,
  tone = "default",
  icon,
}: HorizontalCardBadgeProps) {
  return (
    <span
      data-tone={tone}
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs border whitespace-nowrap",
        TONE_CLASSES[tone],
      )}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      <span className="text-foreground-muted">{label}:</span>
      <span className="font-medium">{value}</span>
    </span>
  );
}
