import { BookOpen } from 'lucide-react'
import { useTheme } from 'next-themes'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { AiIconAnimation, Button, Card, CardContent, CardHeader, CardTitle } from 'ui'
import { Image } from 'ui-patterns/Image'
import {
  PageSection,
  PageSectionContent,
  PageSectionMeta,
  PageSectionSummary,
  PageSectionTitle,
} from 'ui-patterns/PageSection'

import { SIDEBAR_KEYS } from '@/components/layouts/ProjectLayout/LayoutSidebar/LayoutSidebarProvider'
import { useIsFeatureEnabled } from '@/hooks/misc/useIsFeatureEnabled'
import { BASE_PATH, DOCS_URL } from '@/lib/constants'
import { useAiAssistantStateSnapshot } from '@/state/ai-assistant-state'
import { useSidebarManagerSnapshot } from '@/state/sidebar-manager-state'

export const OverviewLearnMore = () => {
  const [isMounted, setIsMounted] = useState(false)
  const aiSnap = useAiAssistantStateSnapshot()
  const { openSidebar } = useSidebarManagerSnapshot()
  const aiAssistantEnabled = useIsFeatureEnabled('ai:assistant')
  const { resolvedTheme } = useTheme()

  useEffect(() => {
    setIsMounted(true)
  }, [])

  const isLight = resolvedTheme === 'light'

  const LearnMoreCards = [
    {
      label: 'Docs',
      title: 'Auth docs',
      description: 'Read more on Powabase auth, managing users and more.',
      image: isLight
        ? `${BASE_PATH}/img/auth-overview/auth-overview-docs-light.jpg`
        : `${BASE_PATH}/img/auth-overview/auth-overview-docs.jpg`,
      actions: [
        {
          label: 'Docs',
          href: `${DOCS_URL}/guides/auth`,
          icon: <BookOpen />,
        },
      ],
    },
    ...(aiAssistantEnabled
      ? [
          {
            label: 'Assistant',
            title: 'Explain auth errors',
            description: 'Our Assistant can help you debug and fix authentication errors.',
            image: isLight
              ? `${BASE_PATH}/img/auth-overview/auth-overview-assistant-light.jpg`
              : `${BASE_PATH}/img/auth-overview/auth-overview-assistant.jpg`,
            actions: [
              {
                label: 'Ask Assistant',
                onClick: () => {
                  openSidebar(SIDEBAR_KEYS.AI_ASSISTANT)
                  aiSnap.newChat({
                    name: 'Auth Help',
                    initialInput:
                      'Look at my logs related to Powabase Auth and help me debug the recent errors.',
                    suggestions: {
                      title:
                        'I can help you with authentication issues. Here are some common problems:',
                      prompts: [
                        {
                          label: 'Login Issues',
                          description: 'Why are users unable to log in to my app?',
                        },
                        {
                          label: 'JWT Problems',
                          description: 'Help me understand and fix JWT token issues',
                        },
                        {
                          label: 'RLS Policies',
                          description: 'Explain my Row Level Security policies and fix issues',
                        },
                        {
                          label: 'Provider Setup',
                          description: 'Help me configure OAuth providers correctly',
                        },
                      ],
                    },
                  })
                },
                icon: <AiIconAnimation size={14} />,
              },
            ],
          },
        ]
      : []),
  ]

  if (!isMounted) return null

  return (
    <PageSection>
      <PageSectionMeta>
        <PageSectionSummary>
          <PageSectionTitle>Learn more</PageSectionTitle>
        </PageSectionSummary>
      </PageSectionMeta>
      <PageSectionContent>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {LearnMoreCards.map((card) => (
            <Card key={card.label} className="relative">
              <CardHeader className="absolute top-0 left-0 right-0 border-b-0">
                <CardTitle className="text-foreground-lighter">{card.label}</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="bg-black/20 flex w-full">
                  <Image
                    src={card.image && card?.image}
                    alt={card.title}
                    width={620}
                    height={324}
                    className="object-fit"
                  />
                </div>
                <div className="p-4 flex flex-col">
                  <div className="flex flex-col gap-1 mb-4 flex-1">
                    <h4>{card.title}</h4>
                    <p className="text-sm text-foreground-lighter">{card.description}</p>
                  </div>
                  <div className="flex flex-col gap-2 items-start mt-auto">
                    {card.actions.map((action) => {
                      if ('href' in action) {
                        return (
                          <Button
                            key={action.label}
                            className="inline-flex"
                            type="default"
                            icon={action.icon}
                            asChild
                          >
                            <Link href={action.href} className="inline-flex">
                              {action.label}
                            </Link>
                          </Button>
                        )
                      } else {
                        return (
                          <Button
                            key={action.label}
                            onClick={action.onClick}
                            type="default"
                            className="inline-flex"
                            icon={action.icon}
                          >
                            {action.label}
                          </Button>
                        )
                      }
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </PageSectionContent>
    </PageSection>
  )
}
