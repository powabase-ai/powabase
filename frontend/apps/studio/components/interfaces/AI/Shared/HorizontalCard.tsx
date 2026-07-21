import { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { HorizontalCardBadge, BadgeTone } from "./HorizontalCardBadge";

export interface HorizontalCardBadgeSpec {
  label: string;
  value: string | number;
  tone?: BadgeTone;
  icon?: ReactNode;
}

export interface HorizontalCardProps {
  href: string;
  icon: ReactNode;
  name: string;
  description?: string | null;
  badges?: HorizontalCardBadgeSpec[];
  rightMeta?: ReactNode;
  actions?: ReactNode;
}

export function HorizontalCard({
  href,
  icon,
  name,
  description,
  badges,
  rightMeta,
  actions,
}: HorizontalCardProps) {
  // The `actions` slot is rendered as an absolutely-positioned sibling rather
  // than a child of the <Link>. Nesting interactive elements (<button> inside
  // <a>) is invalid HTML and triggers React hydration warnings; keeping them
  // as siblings inside a relative wrapper preserves the visual layout while
  // keeping the DOM legal.
  return (
    <div
      className={cn(
        "group relative flex items-stretch gap-3 p-4 rounded-xl",
        "bg-surface-100 border border-muted hover:border-strong",
        "transition",
      )}
    >
      <Link href={href} className="absolute inset-0 rounded-xl" aria-label={name} />

      <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center shrink-0 relative pointer-events-none">
        {icon}
      </div>

      <div className="flex-1 min-w-0 relative pointer-events-none">
        <h3 className="text-base font-medium text-foreground truncate">{name}</h3>
        {description && (
          <p className="text-sm text-foreground-light truncate mt-0.5">{description}</p>
        )}
        {badges && badges.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {badges.map((b, i) => (
              <HorizontalCardBadge key={`${b.label}-${i}`} {...b} />
            ))}
          </div>
        )}
      </div>

      {rightMeta && (
        <div className="shrink-0 text-xs text-foreground-muted self-end whitespace-nowrap relative pointer-events-none">
          {rightMeta}
        </div>
      )}

      {actions && (
        <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition flex gap-1">
          {actions}
        </div>
      )}
    </div>
  );
}
