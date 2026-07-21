import { useIsLoggedIn } from 'common'

import { useStorageGotoCommands } from '../interfaces/Storage/Storage.Commands'
import { useAuthGotoCommands } from './AuthLayout/Auth.Commands'
import { useBillingGotoCommands } from './BillingLayout/Billing.Commands'
import { useDatabaseGotoCommands } from './DatabaseLayout/Database.Commands'
import { useIntegrationsGotoCommands } from './IntegrationsLayout/Integrations.Commands'
import { useProjectSettingsGotoCommands } from './ProjectSettingsLayout/ProjectSettings.Commands'
import { useReportsGotoCommands } from './ReportsLayout/Reports.Commands'
import { useSqlEditorGotoCommands } from './SQLEditorLayout/SqlEditor.Commands'
import { useTableEditorGotoCommands } from './TableEditorLayout/TableEditor.Commands'

export function useLayoutNavCommands() {
  const isLoggedIn = useIsLoggedIn()

  useTableEditorGotoCommands({ enabled: isLoggedIn })
  useSqlEditorGotoCommands({ enabled: isLoggedIn })
  useDatabaseGotoCommands({ enabled: isLoggedIn })
  useAuthGotoCommands({ enabled: isLoggedIn })
  useStorageGotoCommands({ enabled: isLoggedIn })
  useReportsGotoCommands({ enabled: isLoggedIn })
  useProjectSettingsGotoCommands({ enabled: isLoggedIn })
  useIntegrationsGotoCommands({ enabled: isLoggedIn })
  useBillingGotoCommands({ enabled: isLoggedIn })
}
