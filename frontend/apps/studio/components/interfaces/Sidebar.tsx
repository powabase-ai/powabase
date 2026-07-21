import { LOCAL_STORAGE_KEYS, useFlag, useIsMFAEnabled, useParams } from 'common'
import { AnimatePresence, motion, MotionProps } from 'framer-motion'
import { Home } from 'icons'
import { isUndefined } from 'lodash'
import { Blocks, Boxes, ChartArea, PanelLeftDashed, Receipt, Settings, Users } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import {
  cloneElement,
  ComponentProps,
  ComponentPropsWithoutRef,
  FC,
  isValidElement,
  ReactNode,
  useEffect,
} from 'react'
import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Separator,
  SidebarContent as SidebarContentPrimitive,
  SidebarFooter,
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  Sidebar as SidebarPrimitive,
  useSidebar,
} from 'ui'

import { Route } from '../ui/ui.types'
import { useIsPlatformWebhooksEnabled } from './App/FeaturePreview/FeaturePreviewContext'
import {
  generateAIRoutes,
  generateDataRoutes,
  generateOtherRoutes,
  generateProductRoutes,
  generateSettingsRoutes,
  generateToolRoutes,
  generateWorkflowRoutes,
} from '@/components/layouts/Navigation/NavigationBar/NavigationBar.utils'
import { ProjectIndexPageLink } from '@/data/prefetchers/project.$ref'
import { useSendEventMutation } from '@/data/telemetry/send-event-mutation'
import { useHideSidebar } from '@/hooks/misc/useHideSidebar'
import { useIsBillingUiEnabled } from '@/hooks/misc/useIsBillingUiEnabled'
import { useIsFeatureEnabled } from '@/hooks/misc/useIsFeatureEnabled'
import { useLints } from '@/hooks/misc/useLints'
import { useLocalStorageQuery } from '@/hooks/misc/useLocalStorage'
import { useSelectedOrganizationQuery } from '@/hooks/misc/useSelectedOrganization'
import { useSelectedProjectQuery } from '@/hooks/misc/useSelectedProject'
import { useAppStateSnapshot } from '@/state/app-state'

export const ICON_SIZE = 32
export const ICON_STROKE_WIDTH = 1.5
export type SidebarBehaviourType = 'expandable' | 'open' | 'closed'
export const DEFAULT_SIDEBAR_BEHAVIOR = 'expandable'

const SidebarMotion = motion.create(SidebarPrimitive) as FC<
  ComponentProps<typeof SidebarPrimitive> & {
    transition?: MotionProps['transition']
  }
>

export interface SidebarProps extends ComponentPropsWithoutRef<typeof SidebarPrimitive> {}

export const Sidebar = ({ className, ...props }: SidebarProps) => {
  const { setOpen } = useSidebar()
  const hideSideBar = useHideSidebar()

  const [sidebarBehaviour, setSidebarBehaviour] = useLocalStorageQuery(
    LOCAL_STORAGE_KEYS.SIDEBAR_BEHAVIOR,
    DEFAULT_SIDEBAR_BEHAVIOR
  )

  useEffect(() => {
    // logic to toggle sidebar open based on sidebarBehaviour state
    if (sidebarBehaviour === 'open') setOpen(true)
    if (sidebarBehaviour === 'closed') setOpen(false)
  }, [sidebarBehaviour, setOpen])

  return (
    <AnimatePresence>
      {!hideSideBar && (
        <SidebarMotion
          {...props}
          className={cn('z-50', className)}
          transition={{ delay: 0.4, duration: 0.4 }}
          overflowing={sidebarBehaviour === 'expandable'}
          collapsible="icon"
          variant="sidebar"
          onMouseEnter={() => {
            if (sidebarBehaviour === 'expandable') setOpen(true)
          }}
          onMouseLeave={() => {
            if (sidebarBehaviour === 'expandable') setOpen(false)
          }}
        >
          <SidebarContent
            footer={
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="text"
                    className={`w-min px-1.5 mx-0.5 ${sidebarBehaviour === 'open' ? '!px-2' : ''}`}
                    icon={<PanelLeftDashed size={ICON_SIZE} strokeWidth={ICON_STROKE_WIDTH} />}
                  />
                </DropdownMenuTrigger>
                <DropdownMenuContent side="top" align="start" className="w-40">
                  <DropdownMenuRadioGroup
                    value={sidebarBehaviour}
                    onValueChange={(value) => setSidebarBehaviour(value as SidebarBehaviourType)}
                  >
                    <DropdownMenuLabel>Sidebar control</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuRadioItem value="open">Expanded</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="closed">Collapsed</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="expandable">
                      Expand on hover
                    </DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            }
          />
        </SidebarMotion>
      )}
    </AnimatePresence>
  )
}

export const SidebarContent = ({ footer }: { footer?: ReactNode }) => {
  const { ref: projectRef } = useParams()

  return (
    <>
      <AnimatePresence mode="wait">
        <SidebarContentPrimitive>
          {projectRef ? (
            <motion.div key="project-links">
              <ProjectLinks />
            </motion.div>
          ) : (
            <motion.div
              key="org-links"
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
            >
              <OrganizationLinks />
            </motion.div>
          )}
        </SidebarContentPrimitive>
      </AnimatePresence>
      <SidebarFooter>
        <SidebarGroup className="p-0">{footer}</SidebarGroup>
      </SidebarFooter>
    </>
  )
}

export function SideBarNavLink({
  route,
  active,
  onClick,
  ...props
}: {
  route: Route
  active?: boolean
  onClick?: () => void
} & ComponentPropsWithoutRef<typeof SidebarMenuButton>) {
  const [sidebarBehaviour] = useLocalStorageQuery(
    LOCAL_STORAGE_KEYS.SIDEBAR_BEHAVIOR,
    DEFAULT_SIDEBAR_BEHAVIOR
  )

  const buttonProps = {
    disabled: route.disabled,
    tooltip: sidebarBehaviour === 'closed' ? route.label : '',
    isActive: active,
    className: cn('text-sm', sidebarBehaviour === 'open' ? '!px-2' : ''),
    size: 'default' as const,
    onClick: onClick,
  }

  const content = props.children ? (
    props.children
  ) : (
    <>
      {route.icon}
      <span>{route.label}</span>
    </>
  )

  const linkChild =
    route.linkElement && isValidElement(route.linkElement)
      ? cloneElement<any>(route.linkElement, { href: route.link }, content)
      : <Link href={route.link!}>{content}</Link>

  return (
    <SidebarMenuItem>
      {route.link && !route.disabled ? (
        <SidebarMenuButton {...buttonProps} asChild>
          {linkChild}
        </SidebarMenuButton>
      ) : (
        <SidebarMenuButton {...buttonProps}>{content}</SidebarMenuButton>
      )}
    </SidebarMenuItem>
  )
}

const ActiveDot = ({ hasErrors, hasWarnings }: { hasErrors: boolean; hasWarnings: boolean }) => {
  return (
    <div
      className={cn(
        'absolute pointer-events-none flex h-2 w-2 left-[18px] group-data-[state=expanded]:left-[20px] top-2 z-10 rounded-full',
        hasErrors ? 'bg-destructive-600' : hasWarnings ? 'bg-warning-600' : 'bg-transparent'
      )}
    />
  )
}

const ProjectLinks = () => {
  const router = useRouter()
  const { ref } = useParams()
  const { data: project } = useSelectedProjectQuery()
  const { data: org } = useSelectedOrganizationQuery()
  const snap = useAppStateSnapshot()
  const { securityLints, errorLints } = useLints()
  const showReports = useIsFeatureEnabled('reports:all')
  const { mutate: sendEvent } = useSendEventMutation()

  const platformWebhooksEnabled = useIsPlatformWebhooksEnabled()

  const activeRoute = router.pathname.split('/')[3]

  const {
    projectAuthAll: authEnabled,
    projectStorageAll: storageEnabled,
    realtimeAll: realtimeEnabled,
  } = useIsFeatureEnabled(['project_auth:all', 'project_storage:all', 'realtime:all'])

  const authOverviewPageEnabled = useFlag('authOverviewPage')

  const toolRoutes = generateToolRoutes(ref, project)
  const dataRoutes = generateDataRoutes(ref, project)
  const aiRoutes = generateAIRoutes(ref, project)
  const workflowRoutes = generateWorkflowRoutes(ref, project)
  const productRoutes = generateProductRoutes(ref, project, {
    auth: authEnabled,
    storage: storageEnabled,
    realtime: realtimeEnabled,
    authOverviewPage: authOverviewPageEnabled,
  })
  const otherRoutes = generateOtherRoutes(ref, project, {
    showReports,
  })
  const settingsRoutes = generateSettingsRoutes(ref, project)

  return (
    <SidebarMenu>
      <SidebarGroup className="gap-0.5">
        <SideBarNavLink
          key="home"
          active={isUndefined(activeRoute) && !isUndefined(router.query.ref)}
          route={{
            key: 'HOME',
            label: 'Project Overview',
            icon: <Home size={ICON_SIZE} strokeWidth={ICON_STROKE_WIDTH} />,
            link: `/project/${ref}`,
            linkElement: <ProjectIndexPageLink projectRef={ref} />,
          }}
        />
        {toolRoutes.map((route, i) => (
          <SideBarNavLink
            key={`tools-routes-${i}`}
            route={route}
            active={activeRoute === route.key}
          />
        ))}
      </SidebarGroup>
      <Separator className="w-[calc(100%-1rem)] mx-auto" />
      <SidebarGroup className="gap-0.5">
        {dataRoutes.map((route, i) => (
          <SideBarNavLink
            key={`data-routes-${i}`}
            route={route}
            active={activeRoute === route.key}
          />
        ))}
      </SidebarGroup>
      <Separator className="w-[calc(100%-1rem)] mx-auto" />
      <SidebarGroup className="gap-0.5">
        {aiRoutes.map((route, i) => (
          <SideBarNavLink
            key={`ai-routes-${i}`}
            route={route}
            active={activeRoute === route.key}
          />
        ))}
      </SidebarGroup>
      <Separator className="w-[calc(100%-1rem)] mx-auto" />
      <SidebarGroup className="gap-0.5">
        {workflowRoutes.map((route, i) => (
          <SideBarNavLink
            key={`workflow-routes-${i}`}
            route={route}
            active={activeRoute === route.key}
          />
        ))}
      </SidebarGroup>
      <Separator className="w-[calc(100%-1rem)] mx-auto" />
      <SidebarGroup className="gap-0.5">
        {productRoutes.map((route, i) => (
          <SideBarNavLink
            key={`product-routes-${i}`}
            route={route}
            active={activeRoute === route.key}
          />
        ))}
      </SidebarGroup>
      {otherRoutes.length > 0 && (
        <>
          <Separator className="w-[calc(100%-1rem)] mx-auto" />
          <SidebarGroup className="gap-0.5">
            {otherRoutes.map((route, i) => (
              <SideBarNavLink key={route.key} route={route} active={activeRoute === route.key} />
            ))}
          </SidebarGroup>
        </>
      )}
      <Separator className="w-[calc(100%-1rem)] mx-auto" />
      <SidebarGroup className="gap-0.5">
        {settingsRoutes.map((route, i) => (
          <SideBarNavLink
            key={`settings-routes-${i}`}
            route={route}
            active={activeRoute === route.key}
          />
        ))}
      </SidebarGroup>
    </SidebarMenu>
  )
}

export type OrgNavItem = { label: string; href: string; key: string }

export function buildOrgNavItems({
  organizationSlug,
  showBilling,
  billingUiEnabled,
}: {
  organizationSlug: string
  showBilling: boolean
  billingUiEnabled: boolean
}): OrgNavItem[] {
  return [
    { label: 'Projects', href: `/org/${organizationSlug}`, key: 'projects' },
    ...(showBilling && billingUiEnabled
      ? [{ label: 'Billing & Plans', href: `/org/${organizationSlug}/billing`, key: 'billing' }]
      : []),
    // Hidden — no backend support: Team, Integrations, Usage
    { label: 'Organization Settings', href: `/org/${organizationSlug}/general`, key: 'settings' },
  ]
}

const ORG_NAV_ICON: Record<string, ReactNode> = {
  projects: <Boxes size={ICON_SIZE} strokeWidth={ICON_STROKE_WIDTH} />,
  billing: <Receipt size={ICON_SIZE} strokeWidth={ICON_STROKE_WIDTH} />,
  settings: <Settings size={ICON_SIZE} strokeWidth={ICON_STROKE_WIDTH} />,
}

const OrganizationLinks = () => {
  const router = useRouter()
  const { slug } = useParams()

  const organizationSlug: string = slug ?? (router.query.orgSlug as string) ?? ''

  const { data: org } = useSelectedOrganizationQuery()
  const isUserMFAEnabled = useIsMFAEnabled()
  const disableAccessMfa = org?.organization_requires_mfa && !isUserMFAEnabled

  const showBilling = useIsFeatureEnabled('billing:all')
  const billingUiEnabled = useIsBillingUiEnabled(org)

  const activeRoute = router.pathname.split('/')[3]
  const organizationSettingsRoutes = new Set([
    'general',
    'security',
    'sso',
    'apps',
    'audit',
    'documents',
  ])

  const navMenuItems = buildOrgNavItems({ organizationSlug, showBilling, billingUiEnabled })

  if (!organizationSlug) return null

  return (
    <SidebarMenu className="flex flex-col gap-1 items-start">
      <SidebarGroup className="gap-0.5">
        {navMenuItems.map((item, i) => (
          <SideBarNavLink
            key={item.key}
            active={
              i === 0
                ? activeRoute === undefined
                : item.key === 'settings'
                  ? organizationSettingsRoutes.has(activeRoute ?? '')
                  : activeRoute === item.key
            }
            route={{
              label: item.label,
              link: item.href,
              key: item.label,
              icon: ORG_NAV_ICON[item.key],
              disabled: disableAccessMfa,
            }}
          />
        ))}
      </SidebarGroup>
    </SidebarMenu>
  )
}
