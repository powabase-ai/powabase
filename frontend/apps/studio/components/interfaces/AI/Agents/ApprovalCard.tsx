

import { useState } from "react";

interface ApprovalCardProps {
  runId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  message: string;
  onApprove: (runId: string, approved: boolean, reason?: string) => Promise<void>;
  resolved?: boolean;
  resolvedAction?: "approved" | "denied";
}

export function ApprovalCard({
  runId,
  toolName,
  toolInput,
  message,
  onApprove,
  resolved,
  resolvedAction,
}: ApprovalCardProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [denyReason, setDenyReason] = useState("");

  const handleAction = async (approved: boolean) => {
    setIsSubmitting(true);
    try {
      await onApprove(runId, approved, approved ? undefined : denyReason || undefined);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (resolved) {
    return (
      <div className={`p-4 rounded-lg border text-sm ${
        resolvedAction === "approved"
          ? "bg-green-500/5 border-green-500/20 text-green-700"
          : "bg-destructive-200 border-destructive-300 text-destructive-600"
      }`}>
        {resolvedAction === "approved" ? "✓ Approved" : "✗ Denied"}: {toolName}
      </div>
    );
  }

  return (
    <div className="p-4 bg-amber-500/5 border border-amber-500/20 rounded-lg space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-amber-600 font-medium text-sm">⚠ Approval Required</span>
      </div>

      <div className="text-sm space-y-1">
        <div>
          <span className="text-foreground-muted">Tool:</span>{" "}
          <span className="font-mono text-foreground">{toolName}</span>
        </div>
        {Object.entries(toolInput).map(([key, value]) => (
          <div key={key}>
            <span className="text-foreground-muted capitalize">{key}:</span>{" "}
            <code className="text-xs bg-surface-200 px-1 rounded text-foreground">
              {typeof value === "string" ? value : JSON.stringify(value)}
            </code>
          </div>
        ))}
      </div>

      {message && (
        <p className="text-sm text-foreground-lighter italic">&quot;{message}&quot;</p>
      )}

      <div className="space-y-2">
        <div className="flex gap-2">
          <button
            onClick={() => handleAction(true)}
            disabled={isSubmitting}
            className="px-4 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition"
          >
            Approve
          </button>
          <button
            onClick={() => handleAction(false)}
            disabled={isSubmitting}
            className="px-4 py-1.5 bg-surface-200 hover:bg-surface-300 text-destructive-600 text-sm font-medium rounded-lg transition border border-default"
          >
            Deny
          </button>
        </div>
        <input
          type="text"
          value={denyReason}
          onChange={(e) => setDenyReason(e.target.value)}
          placeholder="Optional: reason for denial"
          className="w-full px-3 py-1.5 bg-surface-200 border border-default rounded-md text-sm text-foreground placeholder-foreground-muted focus:outline-none focus:ring-2 focus:ring-brand-400"
        />
      </div>
    </div>
  );
}
