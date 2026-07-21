import { useQuery } from '@tanstack/react-query'
import { Check, Copy, Eye, EyeOff } from 'lucide-react'
import { parseAsBoolean, useQueryState } from 'nuqs'
import { useMemo, useState } from 'react'
import {
  Button,
  copyToClipboard,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogSection,
  DialogTitle,
  Input,
  Tabs_Shadcn_ as Tabs,
  TabsContent_Shadcn_ as TabsContent,
  TabsList_Shadcn_ as TabsList,
  TabsTrigger_Shadcn_ as TabsTrigger,
} from 'ui'

import {
  CONNECTION_FORMATS,
  parsePostgresUrl,
  ProjectConnectionInfo,
} from './ConnectDialog.utils'
import { McpTabContent } from './Connect/McpTabContent'
import { fetchGet } from '@/data/fetchers'
import { useIsFeatureEnabled } from '@/hooks/misc/useIsFeatureEnabled'
import { useSelectedOrganizationQuery } from '@/hooks/misc/useSelectedOrganization'
import { useSelectedProjectQuery } from '@/hooks/misc/useSelectedProject'
import { API_URL } from '@/lib/constants'
import { IS_PLATFORM } from 'common'

export const ConnectDialog = () => {
  const [showConnect, setShowConnect] = useQueryState(
    'showConnect',
    parseAsBoolean.withDefault(false)
  )
  const [connectTab, setConnectTab] = useQueryState('connectTab')
  const { projectConnectionShowMcp } = useIsFeatureEnabled(['project_connection:show_mcp'])
  // On the hosted platform, only show the MCP tab when the MCP URL is actually
  // configured for THIS deployment. Powabase bakes NEXT_PUBLIC_MCP_URL; a BYOC
  // platform build (e.g. judocu) does not, so without this the tab would render
  // pointing at the localhost default. Self-hosted (non-platform) derives the
  // URL from the project apiUrl, so it's unaffected.
  const showMcpTab =
    projectConnectionShowMcp && (!IS_PLATFORM || Boolean(process.env.NEXT_PUBLIC_MCP_URL))
  const { data: project } = useSelectedProjectQuery()
  const { data: organization } = useSelectedOrganizationQuery()

  const projectSlug = (project as any)?.slug
  const orgSlug = organization?.slug

  const { data, isLoading, error } = useQuery<ProjectConnectionInfo>({
    queryKey: ['project-connection', orgSlug, projectSlug],
    queryFn: async () => {
      if (!orgSlug || !projectSlug) throw new Error('Missing org or project')
      const result = await fetchGet<ProjectConnectionInfo>(
        `${API_URL}/organizations/${orgSlug}/projects/${projectSlug}/connection`
      )
      if ('error' in (result as any) && (result as any).error) {
        throw new Error((result as any).message ?? 'Failed to load connection info')
      }
      return result as ProjectConnectionInfo
    },
    enabled: showConnect && !!orgSlug && !!projectSlug,
    staleTime: 5 * 60 * 1000,
  })

  const [selectedFormat, setSelectedFormat] = useState('uri')
  const [copiedItem, setCopiedItem] = useState<string | null>(null)

  const pgParts = useMemo(() => parsePostgresUrl(data?.postgres_url), [data?.postgres_url])
  const formattedConnString = useMemo(() => {
    const fmt = CONNECTION_FORMATS.find((f) => f.id === selectedFormat)
    return fmt ? fmt.format(pgParts) : ''
  }, [selectedFormat, pgParts])

  const handleCopy = (label: string, value: string) => {
    if (!value) return
    copyToClipboard(value)
    setCopiedItem(label)
    setTimeout(() => setCopiedItem(null), 1500)
  }

  return (
    <Dialog open={showConnect} onOpenChange={(open) => setShowConnect(open ? true : null)}>
      <DialogContent size="large">
        <DialogHeader>
          <DialogTitle>Connect to your project</DialogTitle>
        </DialogHeader>
        <DialogSection>
          {error ? (
            <div className="py-8 text-center text-sm text-destructive">
              Failed to load connection info.
            </div>
          ) : isLoading || !data ? (
            <div className="py-8 text-center text-sm text-foreground-lighter">
              Loading connection info...
            </div>
          ) : (
            <Tabs value={connectTab ?? 'api-keys'} onValueChange={(v) => setConnectTab(v)}>
              <TabsList className="gap-4">
                <TabsTrigger value="api-keys">API Keys</TabsTrigger>
                <TabsTrigger value="connection-strings">Connection Strings</TabsTrigger>
                {showMcpTab && <TabsTrigger value="mcp">MCP</TabsTrigger>}
              </TabsList>

              <TabsContent value="api-keys" className="flex flex-col gap-4 mt-4">
                <CopyableField
                  label="Project URL"
                  value={data.kong_url}
                  copiedItem={copiedItem}
                  onCopy={handleCopy}
                />
                <CopyableField
                  label="Anon (Publishable) Key"
                  value={data.anon_key}
                  copiedItem={copiedItem}
                  onCopy={handleCopy}
                />
                <CopyableField
                  label="Service Role (Secret) Key"
                  value={data.service_role_key}
                  hidden
                  copiedItem={copiedItem}
                  onCopy={handleCopy}
                  warning="This key has full access to your database. Never expose it client-side."
                />
                {data.jwt_secret && (
                  <CopyableField
                    label="JWT Secret"
                    value={data.jwt_secret}
                    hidden
                    copiedItem={copiedItem}
                    onCopy={handleCopy}
                    warning="Used to verify JWTs server-side. Never expose client-side."
                  />
                )}
                {data.postgres_url && (
                  <CopyableField
                    label="Database URL"
                    value={data.postgres_url}
                    hidden
                    copiedItem={copiedItem}
                    onCopy={handleCopy}
                  />
                )}
              </TabsContent>

              {showMcpTab && (
                <TabsContent value="mcp" className="mt-4">
                  <McpTabContent
                    projectKeys={{ apiUrl: data.kong_url, anonKey: data.anon_key, publishableKey: data.anon_key }}
                  />
                </TabsContent>
              )}

              <TabsContent value="connection-strings" className="flex flex-col gap-4 mt-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium">Format</label>
                  <select
                    value={selectedFormat}
                    onChange={(e) => setSelectedFormat(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-surface-200 border rounded-md"
                  >
                    {CONNECTION_FORMATS.map((fmt) => (
                      <option key={fmt.id} value={fmt.id}>
                        {fmt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="relative">
                  <pre className="p-3 text-xs font-mono bg-surface-200 border rounded-md overflow-x-auto whitespace-pre-wrap">
                    {formattedConnString}
                  </pre>
                  <Button
                    type="default"
                    size="tiny"
                    className="absolute top-2 right-2"
                    icon={
                      copiedItem === 'connstring' ? (
                        <Check size={14} className="text-brand" />
                      ) : (
                        <Copy size={14} />
                      )
                    }
                    onClick={() => handleCopy('connstring', formattedConnString)}
                  />
                </div>
              </TabsContent>
            </Tabs>
          )}
        </DialogSection>
      </DialogContent>
    </Dialog>
  )
}

interface CopyableFieldProps {
  label: string
  value: string
  hidden?: boolean
  warning?: string
  copiedItem: string | null
  onCopy: (label: string, value: string) => void
}

const CopyableField = ({
  label,
  value,
  hidden = false,
  warning,
  copiedItem,
  onCopy,
}: CopyableFieldProps) => {
  const [revealed, setRevealed] = useState(false)
  const isCopied = copiedItem === label
  const shouldHide = hidden && !revealed

  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium">{label}</label>
      <div className="flex items-center gap-2">
        <Input
          readOnly
          value={shouldHide ? '••••••••••••••••••••••••' : value}
          className="font-mono text-xs flex-1"
        />
        {hidden && (
          <Button
            type="default"
            size="tiny"
            icon={revealed ? <EyeOff size={14} /> : <Eye size={14} />}
            onClick={() => setRevealed((r) => !r)}
          />
        )}
        <Button
          type="default"
          size="tiny"
          icon={isCopied ? <Check size={14} className="text-brand" /> : <Copy size={14} />}
          onClick={() => onCopy(label, value)}
        />
      </div>
      {warning && <p className="text-xs text-foreground-lighter">{warning}</p>}
    </div>
  )
}
