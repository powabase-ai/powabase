import { AnimatePresence, motion } from 'framer-motion'
import { Admonition } from 'ui-patterns/admonition'

import { useIncidentStatusQuery } from '@/data/platform/incident-status-query'
import { processIncidentData } from '@/data/platform/incident-status-utils'

interface IncidentAdmonitionProps {
  isActive: boolean
}

const capitalizeFirstLetter = (str: string) => str.charAt(0).toUpperCase() + str.slice(1)

const getStatusDescription = (
  status: string,
  hasMultipleIncidents: boolean,
  allSameStatus: boolean
): string => {
  const isPlural = hasMultipleIncidents
  const issueTerm = isPlural ? 'these issues' : 'this issue'

  switch (status) {
    case 'investigating':
      if (hasMultipleIncidents && !allSameStatus) {
        return `We are aware of multiple ongoing issues and are investigating.`
      }
      return `We are investigating ${issueTerm}.`

    case 'identified':
      if (hasMultipleIncidents && !allSameStatus) {
        return `We have identified the cause of some of ${issueTerm} and are working on fixes.`
      }
      return `We have identified the cause of ${issueTerm} and are working on a fix.`

    case 'monitoring':
      if (hasMultipleIncidents && !allSameStatus) {
        return `Fixes have been deployed for some of ${issueTerm} and we are monitoring the results.`
      }
      return `A fix has been deployed and we are monitoring the results.`

    case 'resolved':
      if (hasMultipleIncidents && !allSameStatus) {
        return `Some of ${issueTerm} have been resolved, but others may still be ongoing.`
      }
      return `${capitalizeFirstLetter(issueTerm)} ${isPlural ? 'have' : 'has'} been resolved but may take some time to fully recover.`

    default:
      return `We are investigating ${issueTerm}.`
  }
}

export function IncidentAdmonition({ isActive }: IncidentAdmonitionProps) {
  const { data: allStatusPageEvents, isLoading, isError } = useIncidentStatusQuery()
  const { incidents = [] } = allStatusPageEvents ?? {}

  // Don't render anything while loading, on error, or if no incidents
  if (isLoading || isError || !incidents || incidents.length === 0) {
    return null
  }

  const { hasMultipleIncidents, mostCriticalIncident, overallStatus, allSameStatus } =
    processIncidentData(incidents)

  // Show most recent incident name + count if multiple incidents
  const statusTitle =
    (mostCriticalIncident?.name ?? '') +
    (hasMultipleIncidents
      ? ` and ${incidents.length - 1} other issue${incidents.length > 2 ? 's' : ''}`
      : '')

  return (
    <AnimatePresence>
      {isActive && (
        <motion.aside
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
        >
          <Admonition
            type="warning"
            layout="horizontal"
            title={statusTitle}
            description={getStatusDescription(overallStatus, hasMultipleIncidents, allSameStatus)}
          />
        </motion.aside>
      )}
    </AnimatePresence>
  )
}
