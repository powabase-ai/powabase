import { IS_PLATFORM } from 'common'
import { useMemo } from 'react'
import type { ICommand } from 'ui-patterns/CommandMenu'
import { useRegisterCommands } from 'ui-patterns/CommandMenu'

import { COMMAND_MENU_SECTIONS } from './CommandMenu.utils'

export const useSupportCommands = () => {
  const commands = useMemo(() => [] as Array<ICommand>, [])

  useRegisterCommands(COMMAND_MENU_SECTIONS.SUPPORT, commands, { enabled: IS_PLATFORM })
}
