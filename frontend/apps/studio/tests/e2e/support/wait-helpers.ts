import type { APIRequestContext } from '@playwright/test'
import { apiGet } from './api-helpers'

/** Poll a source's extraction_status until 'extracted'; throw on 'failed' or timeout. */
export async function waitForExtraction(
  request: APIRequestContext,
  sourceId: string,
  timeoutMs = 30000,
  intervalMs = 1000
): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const source = await apiGet<{ extraction_status: string }>(request, `/sources/${sourceId}`)
    if (source.extraction_status === 'extracted') return
    if (source.extraction_status === 'failed') {
      throw new Error(`Extraction failed for ${sourceId}: status=failed`)
    }
    await new Promise((r) => setTimeout(r, intervalMs))
  }
  const final = await apiGet<{ extraction_status: string }>(request, `/sources/${sourceId}`)
  throw new Error(
    `Extraction timed out for ${sourceId} after ${timeoutMs}ms (final status: ${final.extraction_status})`
  )
}
