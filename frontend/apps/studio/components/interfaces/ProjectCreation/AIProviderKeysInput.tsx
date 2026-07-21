import { SecretKeyInput } from '@/components/ui/SecretKeyInput'

export interface AIProviderKeysValue {
  openai: string
  anthropic: string
  google: string
  openrouter: string
}

interface Props {
  value: AIProviderKeysValue
  onChange: (next: AIProviderKeysValue) => void
  fieldErrors?: Partial<Record<keyof AIProviderKeysValue, string>>
  /**
   * Hides the built-in "LLM Provider Keys / Provide at least one" header.
   * Used by the BYOK opt-in surface (Set B, gated under `billing:ai_on_us`),
   * which renders its own "Bring your own LLM keys (optional)" header
   * with AI-on-us subtext above the inputs.
   */
  hideHeader?: boolean
}

const PROVIDERS: Array<{ key: keyof AIProviderKeysValue; label: string; placeholder: string }> = [
  { key: 'openai', label: 'OpenAI API Key', placeholder: 'sk-...' },
  { key: 'anthropic', label: 'Anthropic API Key (Claude)', placeholder: 'sk-ant-...' },
  { key: 'google', label: 'Google API Key (Gemini)', placeholder: 'AIza...' },
  { key: 'openrouter', label: 'OpenRouter API Key', placeholder: 'sk-or-...' },
]

export const AIProviderKeysInput = ({ value, onChange, fieldErrors, hideHeader }: Props) => (
  <div className="space-y-4">
    {!hideHeader && (
      <div>
        <h3 className="text-sm font-medium">LLM Provider Keys</h3>
        <p className="text-xs text-foreground-light mt-1">
          Provide at least one — your project's agents and chat will use it.
        </p>
      </div>
    )}
    {PROVIDERS.map(({ key, label, placeholder }) => (
      <div key={key}>
        <label className="text-xs font-medium" htmlFor={`aipk-${key}`}>
          {label}
        </label>
        <SecretKeyInput
          id={`aipk-${key}`}
          placeholder={placeholder}
          value={value[key]}
          onChange={(e) => onChange({ ...value, [key]: e.target.value })}
        />
        {fieldErrors?.[key] && (
          <p className="text-xs text-destructive mt-1">{fieldErrors[key]}</p>
        )}
      </div>
    ))}
  </div>
)
