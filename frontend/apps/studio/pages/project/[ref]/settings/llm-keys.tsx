import { Key, Loader2, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogSection,
  DialogSectionSeparator,
  DialogTitle,
  DialogTrigger,
  Label_Shadcn_,
  Select_Shadcn_,
  SelectContent_Shadcn_,
  SelectItem_Shadcn_,
  SelectTrigger_Shadcn_,
  SelectValue_Shadcn_,
} from 'ui'
import { PageContainer } from 'ui-patterns/PageContainer'
import {
  PageHeader,
  PageHeaderDescription,
  PageHeaderMeta,
  PageHeaderSummary,
  PageHeaderTitle,
} from 'ui-patterns/PageHeader'

import { LLMProviderKeysSettings } from '@/components/interfaces/Settings/LLMProviderKeys/LLMProviderKeysSettings'
import { SecretKeyInput } from '@/components/ui/SecretKeyInput'
import DefaultLayout from '@/components/layouts/DefaultLayout'
import SettingsLayout from '@/components/layouts/ProjectSettingsLayout/SettingsLayout'
import { useLLMPlatformSupportedQuery } from '@/data/llm-provider-keys/llm-platform-supported-query'
import { useLLMProviderKeyCreateMutation } from '@/data/llm-provider-keys/llm-provider-key-create-mutation'
import { useLLMProviderKeyDeleteMutation } from '@/data/llm-provider-keys/llm-provider-key-delete-mutation'
import { useLLMProviderKeyValidateMutation } from '@/data/llm-provider-keys/llm-provider-key-validate-mutation'
import {
  LLMProviderKey,
  useLLMProviderKeysQuery,
} from '@/data/llm-provider-keys/llm-provider-keys-query'
import { useIsFeatureEnabled } from '@/hooks/misc/useIsFeatureEnabled'
import type { NextPageWithLayout } from '@/types'

const PROVIDERS = [
  { value: 'openai', label: 'OpenAI', description: 'GPT models' },
  { value: 'anthropic', label: 'Anthropic', description: 'Claude models' },
  { value: 'google', label: 'Google', description: 'Gemini models' },
  { value: 'openrouter', label: 'OpenRouter', description: 'Aggregator for 200+ models' },
] as const

type ProviderValue = (typeof PROVIDERS)[number]['value']

function getProviderLabel(value: string): string {
  return PROVIDERS.find((p) => p.value === value)?.label ?? value
}

const LLMProviderKeysPage: NextPageWithLayout = () => {
  const { data: keys = [], isLoading } = useLLMProviderKeysQuery()
  const { data: platformSupported } = useLLMPlatformSupportedQuery()
  const isAiOnUsEnabled = useIsFeatureEnabled('billing:ai_on_us')

  const { mutate: createKey, isPending: isSaving } = useLLMProviderKeyCreateMutation()
  const { mutate: deleteKey, isPending: isDeleting, variables: deletingVars } = useLLMProviderKeyDeleteMutation()
  const { mutate: validateKey, isPending: isValidating, variables: validatingVars } = useLLMProviderKeyValidateMutation()

  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [selectedProvider, setSelectedProvider] = useState<ProviderValue | ''>('')
  const [apiKeyValue, setApiKeyValue] = useState('')
  const [validateResult, setValidateResult] = useState<{ provider: string; is_valid: boolean } | null>(null)

  const handleSave = () => {
    if (!selectedProvider || !apiKeyValue) return
    createKey(
      { provider: selectedProvider as ProviderValue, api_key: apiKeyValue },
      {
        onSuccess: () => {
          toast.success(`${getProviderLabel(selectedProvider)} key saved`)
          setAddDialogOpen(false)
          setSelectedProvider('')
          setApiKeyValue('')
          setValidateResult(null)
        },
        onError: (err: any) => toast.error(err.message || 'Failed to save key'),
      }
    )
  }

  const handleValidateInDialog = () => {
    if (!selectedProvider || !apiKeyValue) return
    validateKey(
      { provider: selectedProvider as ProviderValue, api_key: apiKeyValue },
      {
        onSuccess: (data) => {
          setValidateResult({ provider: selectedProvider, is_valid: data.is_valid })
          if (data.is_valid) {
            toast.success('Key is valid')
          } else {
            toast.error(data.error || 'Key is invalid')
          }
        },
        onError: (err: any) => toast.error(err.message || 'Validation failed'),
      }
    )
  }

  const handleValidateExisting = (key: LLMProviderKey) => {
    validateKey(
      { provider: key.provider, api_key: key.masked_key },
      {
        onSuccess: (data) => {
          if (data.is_valid) {
            toast.success(`${getProviderLabel(key.provider)} key is valid`)
          } else {
            toast.error(`${getProviderLabel(key.provider)} key is invalid`)
          }
        },
        onError: (err: any) => toast.error(err.message || 'Validation failed'),
      }
    )
  }

  const handleDelete = (key: LLMProviderKey) => {
    deleteKey(
      { provider: key.provider },
      {
        onSuccess: () => toast.success(`${getProviderLabel(key.provider)} key removed`),
        onError: (err: any) => toast.error(err.message || 'Failed to remove key'),
      }
    )
  }

  const isValidatingProvider = (provider: string) =>
    isValidating && validatingVars?.provider === provider
  const isDeletingProvider = (provider: string) =>
    isDeleting && deletingVars?.provider === provider

  return (
    <>
      <PageHeader size="small">
        <PageHeaderMeta>
          <PageHeaderSummary>
            <PageHeaderTitle>LLM Provider Keys</PageHeaderTitle>
            <PageHeaderDescription>
              LLM provider keys for this project. At least one is required for the project&apos;s
              agents and chat.
            </PageHeaderDescription>
          </PageHeaderSummary>
        </PageHeaderMeta>
      </PageHeader>
      <PageContainer size="small">
        {isAiOnUsEnabled && (
          <div className="mb-8">
            <h3 className="text-foreground text-base font-medium mb-2">AI-on-us availability</h3>
            <p className="text-foreground-light text-sm mb-4">
              When the platform has a key for a provider, that provider runs on us — you only
              pay platform credits, no LLM bill. Where the platform has no key, bring your own.
            </p>
            <LLMProviderKeysSettings
              providers={PROVIDERS.map((p) => p.value)}
              userKeys={Object.fromEntries(keys.map((k) => [k.provider, k.masked_key]))}
              platformProviders={new Set(platformSupported?.providers ?? [])}
              isAiOnUsEnabled={isAiOnUsEnabled}
            />
          </div>
        )}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-foreground text-base font-medium">Configured Keys</h3>
          <Dialog
            open={addDialogOpen}
            onOpenChange={(open) => {
              setAddDialogOpen(open)
              if (!open) {
                setSelectedProvider('')
                setApiKeyValue('')
                setValidateResult(null)
              }
            }}
          >
            <DialogTrigger asChild>
              <Button type="primary" icon={<Plus size={14} />}>
                Add Key
              </Button>
            </DialogTrigger>
            <DialogContent size="small">
              <DialogHeader>
                <DialogTitle>Add LLM Provider Key</DialogTitle>
              </DialogHeader>
              <DialogSectionSeparator />
              <DialogSection className="flex flex-col gap-y-4 py-5">
                <div className="flex flex-col gap-y-2">
                  <Label_Shadcn_ htmlFor="llm-provider">Provider</Label_Shadcn_>
                  <Select_Shadcn_
                    value={selectedProvider}
                    onValueChange={(v) => {
                      setSelectedProvider(v as ProviderValue)
                      setValidateResult(null)
                    }}
                  >
                    <SelectTrigger_Shadcn_ id="llm-provider" className="w-full">
                      <SelectValue_Shadcn_ placeholder="Select a provider" />
                    </SelectTrigger_Shadcn_>
                    <SelectContent_Shadcn_>
                      {PROVIDERS.map((p) => (
                        <SelectItem_Shadcn_ key={p.value} value={p.value}>
                          {p.label} — {p.description}
                        </SelectItem_Shadcn_>
                      ))}
                    </SelectContent_Shadcn_>
                  </Select_Shadcn_>
                </div>
                <div className="flex flex-col gap-y-2">
                  <Label_Shadcn_ htmlFor="llm-api-key">API Key</Label_Shadcn_>
                  <SecretKeyInput
                    id="llm-api-key"
                    placeholder="sk-..."
                    value={apiKeyValue}
                    onChange={(e) => {
                      setApiKeyValue(e.target.value)
                      setValidateResult(null)
                    }}
                  />
                </div>
                {validateResult !== null && (
                  <p
                    className={`text-sm ${validateResult.is_valid ? 'text-brand' : 'text-destructive'}`}
                  >
                    {validateResult.is_valid ? 'Key is valid' : 'Key is invalid'}
                  </p>
                )}
                <Button
                  type="default"
                  disabled={!selectedProvider || !apiKeyValue || isValidating}
                  loading={isValidating}
                  onClick={handleValidateInDialog}
                >
                  Validate
                </Button>
              </DialogSection>
              <DialogSectionSeparator />
              <DialogFooter className="px-5 py-4">
                <Button type="default" onClick={() => setAddDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  type="primary"
                  disabled={!selectedProvider || !apiKeyValue || isSaving}
                  loading={isSaving}
                  onClick={handleSave}
                >
                  Save
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="text-foreground-muted animate-spin" size={24} />
          </div>
        ) : keys.length === 0 ? (
          <div className="border-default bg-surface-100 rounded-md border p-8 text-center">
            <Key className="text-foreground-muted mx-auto mb-3" size={32} />
            <p className="text-foreground-light text-sm">
              No keys yet. Add one to enable agents.
            </p>
          </div>
        ) : (
          <div className="border-default rounded-md border">
            {keys.map((key, idx) => (
              <div
                key={key.provider}
                className={`flex items-center justify-between px-6 py-4 ${
                  idx < keys.length - 1 ? 'border-default border-b' : ''
                }`}
              >
                <div className="flex items-center gap-3">
                  <Key className="text-foreground-muted" size={16} />
                  <div>
                    <div className="text-foreground text-sm font-medium">
                      {getProviderLabel(key.provider)}
                    </div>
                    <div className="text-foreground-muted text-xs font-mono">
                      {key.masked_key}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {key.is_valid === true && <Badge variant="brand">valid</Badge>}
                  {key.is_valid === false && <Badge variant="destructive">invalid</Badge>}
                  {key.is_valid === null && <Badge variant="default">unvalidated</Badge>}
                  <Button
                    type="default"
                    size="tiny"
                    loading={isValidatingProvider(key.provider)}
                    disabled={isValidatingProvider(key.provider)}
                    onClick={() => handleValidateExisting(key)}
                  >
                    Validate
                  </Button>
                  <Button
                    type="danger"
                    size="tiny"
                    icon={<Trash2 size={14} />}
                    loading={isDeletingProvider(key.provider)}
                    disabled={isDeletingProvider(key.provider)}
                    onClick={() => handleDelete(key)}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </PageContainer>
    </>
  )
}

LLMProviderKeysPage.getLayout = (page) => (
  <DefaultLayout>
    <SettingsLayout title="LLM Provider Keys">{page}</SettingsLayout>
  </DefaultLayout>
)

export default LLMProviderKeysPage
