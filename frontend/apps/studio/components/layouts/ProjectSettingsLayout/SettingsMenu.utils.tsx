import { useParams } from 'common'

import { useSelectedProjectQuery } from '@/hooks/misc/useSelectedProject'
import { PROJECT_STATUS } from '@/lib/constants'

export const useGenerateSettingsMenu = () => {
  const { ref } = useParams()
  const { data: project } = useSelectedProjectQuery()

  const isProjectActive = project?.status === PROJECT_STATUS.ACTIVE_HEALTHY

  return [
    {
      title: 'Configuration',
      items: [
        {
          name: 'General',
          key: 'general',
          url: `/project/${ref}/settings/general`,
          items: [],
        },
        {
          name: 'API Keys',
          key: 'api-keys',
          url: `/project/${ref}/settings/api-keys/new`,
          items: [],
          disabled: !isProjectActive,
        },
      ],
    },
    {
      title: 'AI Configuration',
      items: [
        {
          name: 'Agents',
          key: 'agents',
          url: `/project/${ref}/settings/agents`,
          items: [],
        },
        {
          name: 'Tools',
          key: 'tools',
          url: `/project/${ref}/settings/tools`,
          items: [],
        },
        {
          name: 'Sources',
          key: 'sources',
          url: `/project/${ref}/settings/sources`,
          items: [],
        },
        {
          name: 'Knowledge Indexing',
          key: 'knowledge-indexing',
          url: `/project/${ref}/settings/knowledge-indexing`,
          items: [],
        },
        {
          name: 'Knowledge Retrieval',
          key: 'knowledge-retrieval',
          url: `/project/${ref}/settings/knowledge-retrieval`,
          items: [],
        },
        {
          name: 'Workflow Copilot',
          key: 'copilot',
          url: `/project/${ref}/settings/copilot`,
          items: [],
        },
        {
          name: 'LLM Provider Keys',
          key: 'llm-keys',
          url: `/project/${ref}/settings/llm-keys`,
          items: [],
        },
      ],
    },
  ]
}
