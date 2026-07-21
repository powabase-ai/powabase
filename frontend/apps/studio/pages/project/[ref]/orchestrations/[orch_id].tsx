import { useParams } from 'common'
import { useEffect, useState } from "react";
import Link from "next/link";
import { useProjectSupabaseClient } from "@/hooks/ai/useProjectSupabaseClient";
import { hasAiAuth, orchestrationsApi, type Orchestration } from "@/lib/ai-api";
import {
  Tabs_Shadcn_ as Tabs,
  TabsList_Shadcn_ as TabsList,
  TabsTrigger_Shadcn_ as TabsTrigger,
  TabsContent_Shadcn_ as TabsContent,
} from "ui";
import { OverviewTab } from "@/components/interfaces/AI/Orchestrations/OrchDetailTabs/overview-tab";
import { EntitiesTab } from "@/components/interfaces/AI/Orchestrations/OrchDetailTabs/entities-tab";
import { HooksTab } from "@/components/interfaces/AI/Agents/AgentDetailTabs/hooks-tab";
import { SettingsTab } from "@/components/interfaces/AI/Orchestrations/OrchDetailTabs/settings-tab";
import DefaultLayout from '@/components/layouts/DefaultLayout'
import AILayout from '@/components/layouts/AILayout/AILayout'
import type { NextPageWithLayout } from '@/types'

const OrchestrationDetailPage: NextPageWithLayout = () => {
  const { ref, orch_id: orchId } = useParams()
  const { token, isReady } = useProjectSupabaseClient();

  const [orchestration, setOrchestration] = useState<Orchestration | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isReady || !hasAiAuth(token)) return;
    const fetchData = async () => {
      try {
        const data = await orchestrationsApi.get(token, ref!, orchId as string);
        setOrchestration(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [isReady, token, orchId]);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-2 border-brand-400 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error && !orchestration) {
    return (
      <div className="p-8">
        <div className="text-destructive-600">{error}</div>
        <Link
          href={`/project/${ref}/orchestrations`}
          className="mt-4 inline-block text-brand-600 hover:text-brand-600"
        >
          &larr; Back to orchestrations
        </Link>
      </div>
    );
  }

  if (!orchestration) return null;

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-8 xl:px-10">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <Link
            href={`/project/${ref}/orchestrations`}
            className="text-foreground-lighter hover:text-foreground transition"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <h1 className="text-2xl font-semibold text-foreground">{orchestration.name}</h1>
          <span className="text-xs px-2 py-0.5 bg-surface-200 rounded-full text-foreground-lighter capitalize">
            {orchestration.strategy}
          </span>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="overview">
          <TabsList className="flex gap-x-5">
            <TabsTrigger className="py-2.5" value="overview">Overview</TabsTrigger>
            <TabsTrigger className="py-2.5" value="entities">Entities</TabsTrigger>
            <TabsTrigger className="py-2.5" value="hooks">Hooks</TabsTrigger>
            <TabsTrigger className="py-2.5" value="settings">Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <OverviewTab orchestration={orchestration} onUpdate={setOrchestration} />
          </TabsContent>

          <TabsContent value="entities">
            <EntitiesTab orchId={orchId as string} />
          </TabsContent>

          <TabsContent value="hooks">
            <HooksTab agentId="" orchestrationId={orchId as string} />
          </TabsContent>

          <TabsContent value="settings">
            <SettingsTab orchestration={orchestration} onUpdate={setOrchestration} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

OrchestrationDetailPage.getLayout = (page) => (
  <DefaultLayout>
    <AILayout title="Orchestration Detail">{page}</AILayout>
  </DefaultLayout>
)

export default OrchestrationDetailPage
