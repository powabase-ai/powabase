

import type { CopilotMessage as CopilotMessageType } from "@/lib/ai-api";
import { MarkdownText } from "@/components/interfaces/AI/Shared/MarkdownText";

interface CopilotMessageProps {
  message: CopilotMessageType;
  onUndo?: (message: CopilotMessageType) => void;
}

export function CopilotMessage({ message, onUndo }: CopilotMessageProps) {
  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant";
  const hasDiff = isAssistant && message.workflow_diff != null;

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
          isUser
            ? "bg-brand-400 text-white"
            : "bg-surface-200 text-foreground"
        }`}
      >
        {isAssistant ? (
          <MarkdownText>{message.content}</MarkdownText>
        ) : (
          <div className="whitespace-pre-wrap break-words">{message.content}</div>
        )}

        {hasDiff && (
          <div className="mt-2 flex items-center gap-2 pt-2 border-t border-white/10">
            <span className="text-xs opacity-80">Modified workflow</span>
            {onUndo && message.pre_snapshot && (
              <button
                onClick={() => onUndo(message)}
                className={`text-xs underline opacity-80 hover:opacity-100 ${
                  isUser ? "text-white" : "text-brand-600"
                }`}
              >
                Undo
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
