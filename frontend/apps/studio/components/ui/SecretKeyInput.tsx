import { Eye, EyeOff } from 'lucide-react'
import { ComponentProps, CSSProperties, useState } from 'react'
import { cn, Input_Shadcn_ } from 'ui'

type SecretKeyInputProps = Omit<ComponentProps<typeof Input_Shadcn_>, 'type'>

/**
 * Text input for secrets (e.g. LLM provider API keys).
 *
 * It deliberately does NOT use `type="password"`. Password managers ignore
 * `autoComplete="off"` on password fields (Chrome in particular treats it as a
 * hint, not a command) and autofill a saved credential, clobbering whatever the
 * user typed. A plain text field is targeted *less* — but not immune — so we
 * also keep the belt-and-suspenders `data-*` opt-outs below; don't remove them.
 *
 * Masking is cosmetic and WebKit/Blink-only: `-webkit-text-security` renders
 * the dots in Chrome/Edge/Safari but is unsupported in Firefox (and older
 * Safari), where the value shows as plaintext until the reveal toggle is used.
 * The autofill fix itself is browser-independent. If cross-browser masking
 * becomes a requirement, add a `text-security-disc` webfont fallback rather
 * than reverting to a `type="password"` toggle (its hidden state would
 * re-introduce the autofill trigger this component exists to avoid).
 */
export const SecretKeyInput = ({ className, style, ...props }: SecretKeyInputProps) => {
  const [revealed, setRevealed] = useState(false)

  return (
    <div className="relative">
      <Input_Shadcn_
        // Caller props spread FIRST so the security-critical attributes below
        // always win — this component exists to force them, not offer them.
        {...props}
        type="text"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        data-1p-ignore
        data-lpignore="true"
        data-bwignore
        data-form-type="other"
        className={cn('pr-9', className)}
        // `WebkitTextSecurity` isn't in csstype's CSSProperties — cast required.
        style={{ ...style, ...(revealed ? {} : ({ WebkitTextSecurity: 'disc' } as CSSProperties)) }}
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label={revealed ? 'Hide key' : 'Show key'}
        onClick={() => setRevealed((v) => !v)}
        className="text-foreground-lighter hover:text-foreground absolute inset-y-0 right-0 flex items-center px-2.5"
      >
        {revealed ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
    </div>
  )
}
