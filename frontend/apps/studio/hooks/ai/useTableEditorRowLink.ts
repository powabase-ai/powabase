import { useMemo } from 'react'

import { useSelectedProjectQuery } from '@/hooks/misc/useSelectedProject'
import { useTablesQuery } from '@/data/tables/tables-query'

interface UseTableEditorRowLinkArgs {
  /** Postgres schema, e.g. "ai" or "public". */
  schema: string
  /** Postgres table name, e.g. "agent_runs". */
  tableName: string
  /** Column to filter on, defaults to "id". */
  column?: string
}

interface UseTableEditorRowLinkResult {
  /** Function: given a row's id (or any column value) returns a deep-link to
   *  the Table Editor page filtered to that single row. Returns null until
   *  the table-id lookup resolves. */
  buildHref: (value: string | number | null | undefined) => string | null
  /** True while the table-id lookup is in flight. Callers can disable the
   *  link until ready (`href` will be null in the meantime). */
  isLoading: boolean
}

/** Pre-resolves the Table-Editor URL for rows in a given (schema, table).
 *
 *  The Table Editor identifies tables by the `pg_class` OID, not by name —
 *  so to deep-link to a row we have to look the OID up first. This hook
 *  pulls the schema's table list (cached for 5 min by react-query) and
 *  exposes a `buildHref(rowId)` that produces the right URL.
 *
 *  Usage:
 *    const { buildHref } = useTableEditorRowLink({ schema: 'ai', tableName: 'agent_runs' })
 *    <Link href={buildHref(run.id) ?? '#'}> ... </Link>
 */
export function useTableEditorRowLink({
  schema,
  tableName,
  column = 'id',
}: UseTableEditorRowLinkArgs): UseTableEditorRowLinkResult {
  const { data: project } = useSelectedProjectQuery()
  const { data: tables, isLoading } = useTablesQuery(
    {
      projectRef: project?.ref,
      connectionString: project?.connectionString,
      schema,
    },
    { enabled: !!project?.ref },
  )

  const tableId = useMemo(
    () => tables?.find((t) => t.name === tableName)?.id,
    [tables, tableName],
  )

  const buildHref = useMemo(() => {
    return (value: string | number | null | undefined): string | null => {
      if (!project?.ref || tableId === undefined || value == null) return null
      // Table editor URL shape (see grid/components/formatter/ReferenceRecordPeek):
      // /project/{ref}/editor/{tableId}?schema={schema}&filter={col}:eq:{value}
      const filter = encodeURIComponent(`${column}:eq:${value}`)
      return `/project/${project.ref}/editor/${tableId}?schema=${schema}&filter=${filter}`
    }
  }, [project?.ref, tableId, schema, column])

  return { buildHref, isLoading }
}
