import { useParams } from 'common'
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { agentsApi, AgentStats, hasAiAuth } from "@/lib/ai-api";
import { useProjectSupabaseClient, Agent } from "@/hooks/ai/useProjectSupabaseClient";
import {
  Tabs_Shadcn_ as Tabs,
  TabsList_Shadcn_ as TabsList,
  TabsTrigger_Shadcn_ as TabsTrigger,
  TabsContent_Shadcn_ as TabsContent,
} from "ui";
import { OverviewTab } from "@/components/interfaces/AI/Agents/AgentDetailTabs/overview-tab";
import { ToolsTab } from "@/components/interfaces/AI/Agents/AgentDetailTabs/tools-tab";
import { KBTab } from "@/components/interfaces/AI/Agents/AgentDetailTabs/kb-tab";
import { McpTab } from "@/components/interfaces/AI/Agents/AgentDetailTabs/mcp-tab";
import { HooksTab } from "@/components/interfaces/AI/Agents/AgentDetailTabs/hooks-tab";
import { SettingsTab } from "@/components/interfaces/AI/Agents/AgentDetailTabs/settings-tab";
import DefaultLayout from '@/components/layouts/DefaultLayout'
import AILayout from '@/components/layouts/AILayout/AILayout'
import type { NextPageWithLayout } from '@/types'

const AgentDetailPage: NextPageWithLayout = () => {
  const { ref, agent_id } = useParams()
  const agentId = agent_id as string
  const router = useRouter();
  const { token, isReady } = useProjectSupabaseClient();

  const [agent, setAgent] = useState<Agent | null>(null);
  const [stats, setStats] = useState<AgentStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isReady || !hasAiAuth(token)) return;
    const fetchAgent = async () => {
      try {
        const data = await agentsApi.get(token, ref as string, agentId);
        setAgent(data as Agent);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load agent");
      } finally {
        setIsLoading(false);
      }
    };
    fetchAgent();
  }, [isReady, token, ref, agentId]);

  // Agent stats deferred: /agents/:id/stats is not yet implemented in
  // agentic-project-service. Legacy called agentsApi.getStats and passed
  // the result as `stats` to OverviewTab; we pass `stats={null}` instead
  // and the tab renders placeholders. Tracked as audit F2. Restore when
  // the endpoint lands.

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-2 border-brand-400 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error && !agent) {
    return (
      <div className="p-8">
        <div className="text-destructive-600">{error}</div>
        <Link
          href={`/project/${ref}/agents`}
          className="mt-4 inline-block text-brand-600 hover:text-brand-600"
        >
          &larr; Back to agents
        </Link>
      </div>
    );
  }

  if (!agent) return null;

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-8 xl:px-10">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <Link
            href={`/project/${ref}/agents`}
            className="text-foreground-lighter hover:text-foreground transition"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <h1 className="text-2xl font-semibold text-foreground">{agent.name}</h1>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="overview">
          <TabsList className="flex gap-x-5">
            <TabsTrigger className="py-2.5" value="overview">Overview</TabsTrigger>
            <TabsTrigger className="py-2.5" value="tools">Tools</TabsTrigger>
            <TabsTrigger className="py-2.5" value="knowledge-bases">Knowledge Bases</TabsTrigger>
            <TabsTrigger className="py-2.5" value="mcp-servers">MCP Servers</TabsTrigger>
            <TabsTrigger className="py-2.5" value="hooks">Hooks</TabsTrigger>
            <TabsTrigger className="py-2.5" value="settings">Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <OverviewTab
              agent={agent}
              stats={stats}
              onAgentUpdate={setAgent}
            />
          </TabsContent>

          <TabsContent value="tools">
            <ToolsTab agentId={agentId as string} />
          </TabsContent>

          <TabsContent value="knowledge-bases">
            <KBTab agentId={agentId as string} />
          </TabsContent>

          <TabsContent value="mcp-servers">
            <McpTab agentId={agentId as string} />
          </TabsContent>

          <TabsContent value="hooks">
            <HooksTab agentId={agentId as string} />
          </TabsContent>

          <TabsContent value="settings">
            <SettingsTab
              agent={agent}
              onAgentUpdate={setAgent}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

AgentDetailPage.getLayout = (page) => (
  <DefaultLayout>
    <AILayout title="Agent Detail">{page}</AILayout>
  </DefaultLayout>
)

export default AgentDetailPage
