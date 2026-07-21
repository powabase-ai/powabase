import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'

import { constructHeaders, fetchHandler } from '@/data/fetchers'
import { BASE_PATH } from '@/lib/constants'
import { ResponseError, UseCustomMutationOptions } from '@/types'

export type SqlTitleGenerateResponse = {
  title: string
  description: string
}

export type SqlTitleGenerateVariables = {
  sql: string
}

export async function generateSqlTitle({ sql }: SqlTitleGenerateVariables) {
  // AI title generation requires Supabase platform auth.
  // Return a fallback title derived from the SQL statement.
  const firstLine = sql.trim().split('\n')[0].slice(0, 60)
  const title = firstLine || 'Untitled query'
  return { title, description: '' } as SqlTitleGenerateResponse
}

type SqlTitleGenerateData = Awaited<ReturnType<typeof generateSqlTitle>>

export const useSqlTitleGenerateMutation = ({
  onSuccess,
  onError,
  ...options
}: Omit<
  UseCustomMutationOptions<SqlTitleGenerateData, ResponseError, SqlTitleGenerateVariables>,
  'mutationFn'
> = {}) => {
  return useMutation<SqlTitleGenerateData, ResponseError, SqlTitleGenerateVariables>({
    mutationFn: (vars) => generateSqlTitle(vars),
    async onSuccess(data, variables, context) {
      await onSuccess?.(data, variables, context)
    },
    async onError(data, variables, context) {
      if (onError === undefined) {
        toast.error(`Failed to generate title: ${data.message}`)
      } else {
        onError(data, variables, context)
      }
    },
    ...options,
  })
}
