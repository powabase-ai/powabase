import React, { type ComponentType } from 'react'

/**
 * Lazy-loaded product menu components to avoid circular dependencies
 * (registry -> Layout -> ProjectLayout -> MobileMenuContent -> registry).
 * Sections without a dedicated product menu map to null.
 */
export const MOBILE_PRODUCT_MENU_REGISTRY: Record<string, ComponentType | null> = {
  HOME: null,
  editor: React.lazy(() =>
    import('@/components/layouts/TableEditorLayout/TableEditorMenu').then((m) => ({
      default: m.TableEditorMenu,
    }))
  ),
  sql: React.lazy(() =>
    import('@/components/layouts/SQLEditorLayout/SQLEditorMenu').then((m) => ({
      default: m.SQLEditorMenu,
    }))
  ),
  database: React.lazy(() =>
    import('@/components/layouts/DatabaseLayout/DatabaseLayout').then((m) => ({
      default: m.DatabaseProductMenu,
    }))
  ),
  auth: React.lazy(() =>
    import('@/components/layouts/AuthLayout/AuthLayout').then((m) => ({
      default: m.AuthProductMenu,
    }))
  ),
  storage: React.lazy(() =>
    import('@/components/interfaces/Storage/StorageMenuV2').then((m) => ({
      default: m.StorageMenuV2,
    }))
  ),
  realtime: React.lazy(() =>
    import('@/components/layouts/RealtimeLayout/RealtimeLayout').then((m) => ({
      default: m.RealtimeProductMenu,
    }))
  ),
  // 'observability' has no entry (like the sibling AI-section keys — agents,
  // orchestrations, knowledge-bases, runs, workflows): it renders under AILayout,
  // which doesn't use this per-product submenu. The old entry pointed at
  // ObservabilityLayout/ObservabilityMenu, the pre-rebuild per-service Reports menu
  // that pages/project/[ref]/observability/index.tsx no longer uses.
  api: null,
  integrations: React.lazy(() =>
    import('@/components/layouts/Integrations/IntegrationsProductMenu').then((m) => ({
      default: m.IntegrationsProductMenu,
    }))
  ),
  settings: React.lazy(() =>
    import('@/components/layouts/ProjectSettingsLayout/SettingsLayout').then((m) => ({
      default: m.SettingsProductMenu,
    }))
  ),
}

export function getProductMenuComponent(sectionKey: string): ComponentType | null {
  return MOBILE_PRODUCT_MENU_REGISTRY[sectionKey] ?? null
}
