
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "ui";

interface InfoTooltipProps {
  title: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * An (i) icon that opens a modal with detailed information when clicked.
 * Use for fields where inline descriptions would be too verbose.
 */
export function InfoTooltip({ title, children, className }: InfoTooltipProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex items-center justify-center w-4 h-4 rounded-full border border-foreground-muted text-foreground-muted hover:border-foreground-light hover:text-foreground-light transition-colors text-[10px] leading-none font-medium flex-shrink-0 ${className ?? ""}`}
        aria-label={`More info about ${title}`}
      >
        i
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader className="p-6 pb-0">
            <DialogTitle>{title}</DialogTitle>
            {/* Visually hidden but exposed to assistive tech. Inline styles are
                used instead of the `sr-only` Tailwind utility because that
                class isn't always emitted in this project's CSS bundle and we
                were rendering the description visibly under the title. */}
            <DialogDescription
              style={{
                position: "absolute",
                width: 1,
                height: 1,
                padding: 0,
                margin: -1,
                overflow: "hidden",
                clip: "rect(0, 0, 0, 0)",
                whiteSpace: "nowrap",
                borderWidth: 0,
              }}
            >
              Detailed information about {title}
            </DialogDescription>
          </DialogHeader>
          <div className="px-6 pb-6 mt-4 text-sm text-foreground-light space-y-3">
            {children}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * A label + info tooltip combo for form fields.
 * Renders the label text with an (i) icon that opens the info modal.
 */
interface FieldLabelProps {
  htmlFor?: string;
  label: string;
  description?: string;
  infoTitle?: string;
  infoContent?: React.ReactNode;
  className?: string;
}

export function FieldLabel({
  htmlFor,
  label,
  description,
  infoTitle,
  infoContent,
  className,
}: FieldLabelProps) {
  return (
    <div className={`mb-2 ${className ?? ""}`}>
      <div className="flex items-center gap-1.5">
        <label htmlFor={htmlFor} className="block text-sm font-medium text-foreground">
          {label}
        </label>
        {infoContent && (
          <InfoTooltip title={infoTitle || label}>{infoContent}</InfoTooltip>
        )}
      </div>
      {description && (
        <p className="text-xs text-foreground-muted mt-1 leading-normal">{description}</p>
      )}
    </div>
  );
}
