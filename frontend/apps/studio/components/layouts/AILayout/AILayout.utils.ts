import { useParams } from 'common'

import type { ProductMenuGroup } from '@/components/ui/ProductMenu/ProductMenu.types'

export function generateAIMenu(ref?: string): ProductMenuGroup[] {
  const baseUrl = `/project/${ref}`

  return [
    {
      title: 'AI Features',
      items: [
        { name: 'Agents', key: 'agents', url: `${baseUrl}/agents`, items: [] },
        {
          name: 'Knowledge Bases',
          key: 'knowledge-bases',
          url: `${baseUrl}/knowledge-bases`,
          items: [],
        },
        { name: 'Sources', key: 'sources', url: `${baseUrl}/sources`, items: [] },
        { name: 'Workflows', key: 'workflows', url: `${baseUrl}/workflows`, items: [] },
        {
          name: 'Orchestrations',
          key: 'orchestrations',
          url: `${baseUrl}/orchestrations`,
          items: [],
        },
        { name: 'Runs', key: 'runs', url: `${baseUrl}/runs`, items: [] },
      ],
    },
    {
      title: 'Monitoring',
      items: [
        {
          name: 'Observability',
          key: 'observability',
          url: `${baseUrl}/observability`,
          items: [],
        },
      ],
    },
  ]
}

export const useGenerateAIMenu = (): ProductMenuGroup[] => {
  const { ref } = useParams()
  return generateAIMenu(ref)
}
