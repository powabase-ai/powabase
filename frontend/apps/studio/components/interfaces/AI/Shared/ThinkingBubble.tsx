import { cn } from "ui";

interface ThinkingBubbleProps {
  className?: string;
  label?: string;
}

export function ThinkingBubble({ className, label = "Thinking..." }: ThinkingBubbleProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2.5 px-3.5 py-2 rounded-2xl rounded-bl-md",
        "border border-brand-400/25 bg-gradient-to-r from-brand-400/10 via-brand-400/5 to-transparent",
        "shadow-sm backdrop-blur-[1px]",
        className
      )}
    >
      <span className="relative block h-4 w-4 animate-thinking-orb">
        <span className="absolute left-1/2 top-0 -translate-x-1/2 h-1.5 w-1.5 rounded-full bg-brand-400" />
        <span className="absolute bottom-[2px] left-[2px] h-1.5 w-1.5 rounded-full bg-brand-400/70" />
        <span className="absolute bottom-[2px] right-[2px] h-1.5 w-1.5 rounded-full bg-brand-400/40" />
      </span>
      <span className="text-sm font-medium animate-thinking-shimmer">{label}</span>
    </div>
  );
}
