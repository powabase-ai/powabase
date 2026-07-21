

import {
  Play,
  Split,
  Layers,
  Webhook,
  Network,
  HelpCircle,
} from "lucide-react";
import {
  PaperPlaneIcon,
  CodeBranchIcon,
  RobotIcon,
  CodeIcon,
  GlobeIcon,
} from "./BlockIcons";
import { blockRegistry, getDefaultConfig } from "@/data/ai-workflows/block-registry";

export const SINGLETON_TYPES = new Set(["starter", "webhook", "response"]);

const iconMap: Record<string, React.ComponentType<{ className?: string; strokeWidth?: number }>> = {
  Play,
  // Filled Font Awesome replacements — the lucide-react equivalents are
  // thin-line glyphs that dissolve on tinted tiles at this size. Keys match
  // the legacy registry string so block-registry.ts needs no changes.
  Bot: RobotIcon,
  Code: CodeIcon,
  GitBranch: CodeBranchIcon,
  Split,
  Globe: GlobeIcon,
  Layers,
  MessageSquare: PaperPlaneIcon,
  Webhook,
  Network,
};

// Arbitrary-hex values are used for amber/violet/orange/indigo/blue because
// this app's tailwind config remaps those color names onto Radix Colors (see
// frontend/packages/config/ui.config.js), where `-500` resolves to step 5 —
// a pale interactive-background tint, not Tailwind's saturated mid-tone.
// The hex values below are Tailwind's canonical default palette.
const iconColorMap: Record<string, string> = {
  emerald: "text-emerald-300",
  violet: "text-[#c4b5fd]",
  amber: "text-[#fcd34d]",
  orange: "text-[#fdba74]",
  blue: "text-[#93c5fd]",
  teal: "text-teal-300",
  cyan: "text-cyan-300",
  sky: "text-sky-300",
  indigo: "text-[#a5b4fc]",
  rose: "text-rose-300",
  slate: "text-slate-200",
};

const tileBgMap: Record<string, string> = {
  emerald: "bg-emerald-500/30 border-emerald-400/60",
  violet: "bg-[#8b5cf6]/30 border-[#a78bfa]/60",
  amber: "bg-[#f59e0b]/30 border-[#fbbf24]/60",
  orange: "bg-[#f97316]/30 border-[#fb923c]/60",
  blue: "bg-[#3b82f6]/30 border-[#60a5fa]/60",
  teal: "bg-teal-500/30 border-teal-400/60",
  cyan: "bg-cyan-500/30 border-cyan-400/60",
  sky: "bg-sky-500/30 border-sky-400/60",
  indigo: "bg-[#6366f1]/30 border-[#818cf8]/60",
  rose: "bg-rose-500/30 border-rose-400/60",
  slate: "bg-slate-500/40 border-slate-400/60",
};

interface BlockPaletteProps {
  onAddBlock: (blockType: string, config: Record<string, unknown>) => void;
  existingBlockTypes: Set<string>;
}

export function BlockPalette({ onAddBlock, existingBlockTypes }: BlockPaletteProps) {
  return (
    <div className="w-56 bg-surface-100 border-r border-default flex flex-col h-full" style={{ boxShadow: '8px 0 24px rgb(0 0 0 / 0.2)' }}>
      <div className="px-3 py-3 border-b border-default">
        <h3 className="text-xs font-medium text-foreground-muted uppercase tracking-wider">
          Blocks
        </h3>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {Object.values(blockRegistry).map((blockType) => {
          const Icon = iconMap[blockType.icon] ?? HelpCircle;
          const disabled = SINGLETON_TYPES.has(blockType.type) && existingBlockTypes.has(blockType.type);
          return (
            <button
              key={blockType.type}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm rounded-md text-foreground transition-colors text-left ${disabled ? "opacity-40 cursor-not-allowed" : "hover:bg-surface-300"}`}
              onClick={() =>
                !disabled && onAddBlock(blockType.type, getDefaultConfig(blockType.type))
              }
              draggable={!disabled}
              onDragStart={(e) => {
                if (disabled) { e.preventDefault(); return; }
                e.dataTransfer.setData("blockType", blockType.type);
                e.dataTransfer.effectAllowed = "move";
              }}
            >
              <div className={`shrink-0 flex items-center justify-center h-7 w-7 rounded-md border ${tileBgMap[blockType.color] ?? "bg-slate-500/30 border-slate-400/60"}`}>
                <Icon className={`h-4 w-4 ${iconColorMap[blockType.color] ?? "text-slate-200"}`} />
              </div>
              <div className="min-w-0">
                <div className="font-medium truncate">{blockType.name}</div>
                <div className="text-xs text-foreground-muted truncate">
                  {blockType.description}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
