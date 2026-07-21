"use client";

import { useState } from "react";
import { Citation } from "@/lib/ai-api";
import {
  Popover_Shadcn_ as Popover,
  PopoverContent_Shadcn_ as PopoverContent,
  PopoverTrigger_Shadcn_ as PopoverTrigger,
} from "ui";

interface CitationBadgeProps {
  citation: Citation;
}

export function CitationBadge({ citation }: CitationBadgeProps) {
  const [open, setOpen] = useState(false);

  const page = citation.page as number | undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="inline-flex items-center justify-center rounded bg-blue-100 px-1 text-xs font-medium text-blue-700 hover:bg-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:hover:bg-blue-900/60"
          style={{ minWidth: "1.25rem", lineHeight: "1.25rem" }}
        >
          {(citation as any).key ?? citation.source_id}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 text-sm" side="top" align="start">
        <div className="space-y-1.5">
          <p className="font-medium text-foreground">
            {citation.source_name || "Unknown source"}
            {page != null && <span className="ml-1 text-muted-foreground">p.{page}</span>}
          </p>
          {citation.text && (
            <p className="text-muted-foreground text-xs leading-relaxed line-clamp-4">
              {citation.text}
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
