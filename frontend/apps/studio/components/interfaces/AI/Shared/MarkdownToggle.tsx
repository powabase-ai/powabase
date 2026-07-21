

import { useEffect } from "react";
import { Eye, Type } from "lucide-react";
import { Button_Shadcn_ as Button, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "ui";
import { useMarkdownState, markdownState } from "@/state/markdown-state";

export function MarkdownToggle() {
  const { renderMarkdown } = useMarkdownState();

  useEffect(() => {
    markdownState.initialize();
  }, []);

  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => markdownState.toggle()}
            aria-label={renderMarkdown ? "Show raw text" : "Render markdown"}
          >
            {renderMarkdown ? <Type size={14} /> : <Eye size={14} />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {renderMarkdown ? "Show raw text" : "Render markdown"}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
